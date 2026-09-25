import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { PrismaProjectRepository } from "@/server/repositories/prisma-project-repository";
import { PublishJobRepository } from "@/server/repositories/publish-job-repository";
import { RenderJobRepository } from "@/server/repositories/render-job-repository";
import { YouTubeAccountRepository } from "@/server/repositories/youtube-account-repository";
import { runPublishJob } from "@/server/youtube/publish-queue";
import { MockYouTubeClient } from "@/server/youtube/mock-youtube-client";
import { deriveProjectStatus } from "@/server/services/pipeline-service";
import { publishSettingsSchema } from "@/server/validation/publish-schemas";
import { renderFilePath } from "@/server/render/render-storage";
import { DEFAULT_VISIBILITY } from "@/types/youtube";
import type {
  ChannelInfo,
  ProcessingStatus,
  UploadRequest,
  UploadResult,
  YouTubeClient,
} from "@/server/youtube/youtube-client";
import type { PublishSettings } from "@/types/youtube";
import { makeLesson, makeProject, makeScene, makeStoredScenes } from "./helpers/factories";
import { createTestDatabase } from "./helpers/test-db";
import type { TestDatabase } from "./helpers/test-db";
import { mkdir, rm, writeFile } from "node:fs/promises";

/**
 * `getServerEnv()` caches on its first read, so the key has to be in place
 * before anything in this file triggers one. Setting it at module scope rather
 * than in a hook is what guarantees that, whatever order the tests run in.
 */
process.env.YOUTUBE_TOKEN_KEY ??= Buffer.alloc(32, 3).toString("base64");

let db: TestDatabase;
let projects: PrismaProjectRepository;
let jobs: PublishJobRepository;
let renders: RenderJobRepository;
let accounts: YouTubeAccountRepository;

/** Files this suite wrote into the real render directory, cleaned up after. */
const written: string[] = [];

before(() => {
  db = createTestDatabase();
  projects = new PrismaProjectRepository(db.client);
  jobs = new PublishJobRepository(db.client);
  renders = new RenderJobRepository(db.client);
  accounts = new YouTubeAccountRepository(db.client);
});

after(async () => {
  for (const fileName of written) {
    await rm(renderFilePath(fileName), { force: true });
  }
  await db.dispose();
});

const SETTINGS: PublishSettings = {
  title: "Five Ways to Count in Korean",
  description: "A short lesson.",
  tags: ["korean", "language"],
  visibility: "private",
  categoryId: "27",
  language: "en",
  thumbnail: "none",
};

/** A project with a storyboard and a finished render on disk. */
async function seedPublishable(format: "shorts" | "long" = "shorts") {
  const project = makeProject({
    format,
    shortsDurationSeconds: format === "shorts" ? 30 : null,
    longDurationSeconds: format === "long" ? 300 : null,
  });
  await projects.create(project);
  await projects.update(project.id, {
    lesson: makeLesson(),
    scenes: makeStoredScenes([makeScene()]),
  });

  const render = (await renders.createIfIdle(project.id, format))!;
  const fileName = `test-publish-${render.id}.mp4`;
  await mkdir(renderFilePath("x").replace(/\/[^/]+$/, ""), { recursive: true });
  await writeFile(renderFilePath(fileName), Buffer.alloc(2048, 7));
  written.push(fileName);

  await renders.claim(render.id);
  await renders.markCompleted(render.id, {
    fileName,
    contentType: "video/mp4",
    byteSize: 2048,
  });

  return { projectId: project.id, fileName };
}

async function createJob(projectId: string, overrides: Partial<PublishSettings> = {}) {
  const job = await jobs.createIfIdle({
    projectId,
    format: "shorts",
    settings: { ...SETTINGS, ...overrides },
    provider: "mock",
  });
  assert.ok(job, "a job was created");
  return job;
}

describe("the publish form's rules", () => {
  test("accepts a filled-in form", () => {
    assert.equal(publishSettingsSchema.safeParse(SETTINGS).success, true);
  });

  test("requires a title", () => {
    const result = publishSettingsSchema.safeParse({ ...SETTINGS, title: "   " });
    assert.equal(result.success, false);
  });

  test("rejects a title over YouTube's 100-character limit", () => {
    const result = publishSettingsSchema.safeParse({
      ...SETTINGS,
      title: "a".repeat(101),
    });
    assert.equal(result.success, false);
  });

  test("rejects angle brackets, which YouTube refuses outright", () => {
    const result = publishSettingsSchema.safeParse({
      ...SETTINGS,
      title: "Korean <b>numbers</b>",
    });
    assert.equal(result.success, false);
  });

  test("rejects a tag list over the shared 500-character budget", () => {
    const result = publishSettingsSchema.safeParse({
      ...SETTINGS,
      tags: Array.from({ length: 12 }, () => "a".repeat(45)),
    });
    assert.equal(result.success, false);
  });

  test("rejects a visibility YouTube does not have", () => {
    const result = publishSettingsSchema.safeParse({
      ...SETTINGS,
      visibility: "friends",
    });
    assert.equal(result.success, false);
  });

  test("private is the default visibility", () => {
    assert.equal(DEFAULT_VISIBILITY, "private");
  });
});

describe("creating a publish job", () => {
  test("starts pending with nothing published", async () => {
    const { projectId } = await seedPublishable();
    const job = await createJob(projectId);

    assert.equal(job.status, "pending");
    assert.equal(job.progress, 0);
    assert.equal(job.publication, null);
    assert.equal(job.errorMessage, null);
  });

  test("keeps what the creator actually submitted", async () => {
    const { projectId } = await seedPublishable();
    const job = await createJob(projectId, { tags: ["one", "two"], visibility: "unlisted" });

    assert.deepEqual(job.settings.tags, ["one", "two"]);
    assert.equal(job.settings.visibility, "unlisted");
    assert.equal(job.settings.categoryId, "27");
  });

  test("refuses a second job while one is in flight", async () => {
    const { projectId } = await seedPublishable();

    const first = await jobs.createIfIdle({
      projectId,
      format: "shorts",
      settings: SETTINGS,
      provider: "mock",
    });
    const second = await jobs.createIfIdle({
      projectId,
      format: "shorts",
      settings: SETTINGS,
      provider: "mock",
    });

    assert.ok(first);
    assert.equal(second, null, "a duplicate upload is refused");
  });

  test("a job can only be claimed once", async () => {
    const { projectId } = await seedPublishable();
    const job = await createJob(projectId);

    assert.equal(await jobs.claim(job.id), true);
    assert.equal(await jobs.claim(job.id), false, "a second worker loses");
  });
});

describe("running a publish through the queue", () => {
  test("uploads, records the video, and completes", async () => {
    const { projectId } = await seedPublishable();
    const job = await createJob(projectId);

    await runPublishJob({
      jobId: job.id,
      client: new MockYouTubeClient({ stepDelayMs: 0 }),
      jobs,
      projects,
      renders,
      pollIntervalMs: 1,
    });

    const settled = await jobs.findById(job.id);
    assert.equal(settled?.status, "completed");
    assert.equal(settled?.progress, 100);
    assert.ok(settled?.publication, "a publication was recorded");
    assert.ok(settled?.publication?.videoId);
    assert.ok(settled?.publication?.videoUrl);
    assert.ok(settled?.publication?.publishedAt);
    assert.equal(settled?.publication?.visibility, "private");
    assert.equal(settled?.publication?.projectId, projectId);
  });

  test("the project records the video and becomes published", async () => {
    const { projectId } = await seedPublishable();
    const job = await createJob(projectId);

    await runPublishJob({
      jobId: job.id,
      client: new MockYouTubeClient({ stepDelayMs: 0 }),
      jobs,
      projects,
      renders,
      pollIntervalMs: 1,
    });

    const project = await projects.findById(projectId);
    assert.ok(project?.publishedAt, "publishedAt is set from the upload");
    assert.ok(project?.youtubeUrl, "the watch URL is stored");
    assert.equal(deriveProjectStatus(project!), "published");
    assert.equal(project?.status, "published", "the stored status was synced");
  });

  test("progress is reported while uploading", async () => {
    const { projectId } = await seedPublishable();
    const job = await createJob(projectId);
    const seen: number[] = [];

    class Watching extends MockYouTubeClient {
      async uploadVideo(request: UploadRequest): Promise<UploadResult> {
        return super.uploadVideo({
          ...request,
          onProgress: async (percent) => {
            seen.push(percent);
            await request.onProgress(percent);
          },
        });
      }
    }

    await runPublishJob({
      jobId: job.id,
      client: new Watching({ stepDelayMs: 0 }),
      jobs,
      projects,
      renders,
      pollIntervalMs: 1,
    });

    assert.deepEqual(seen, [20, 40, 60, 80, 100]);
  });

  test("a failed upload leaves the project unpublished", async () => {
    const { projectId } = await seedPublishable();
    const job = await createJob(projectId);

    const failing: YouTubeClient = {
      name: "test-failure",
      uploadsForReal: false,
      getChannel: async (): Promise<ChannelInfo> => ({
        channelId: "c",
        channelTitle: "c",
      }),
      uploadVideo: async () => {
        throw new Error("The connection to YouTube dropped during the upload.");
      },
      getProcessingStatus: async (): Promise<ProcessingStatus> => ({
        state: "unknown",
        detail: null,
      }),
      setThumbnail: async () => null,
    };

    await runPublishJob({
      jobId: job.id,
      client: failing,
      jobs,
      projects,
      renders,
      pollIntervalMs: 1,
    });

    const settled = await jobs.findById(job.id);
    assert.equal(settled?.status, "failed");
    assert.match(settled?.errorMessage ?? "", /dropped/);
    assert.equal(settled?.publication, null);

    const project = await projects.findById(projectId);
    assert.equal(project?.publishedAt, null, "a failed upload publishes nothing");
    assert.notEqual(deriveProjectStatus(project!), "published");
  });

  test("a video that YouTube rejects fails the job but keeps its id", async () => {
    const { projectId } = await seedPublishable();
    const job = await createJob(projectId);

    class Rejecting extends MockYouTubeClient {
      async getProcessingStatus(): Promise<ProcessingStatus> {
        return { state: "rejected", detail: "duplicate" };
      }
    }

    await runPublishJob({
      jobId: job.id,
      client: new Rejecting({ stepDelayMs: 0 }),
      jobs,
      projects,
      renders,
      pollIntervalMs: 1,
    });

    const settled = await jobs.findById(job.id);
    assert.equal(settled?.status, "failed");
    assert.match(settled?.errorMessage ?? "", /duplicate/);
    assert.ok(
      settled?.publication?.videoId,
      "the id survives so the creator can find and remove the video",
    );

    const project = await projects.findById(projectId);
    assert.equal(
      project?.publishedAt,
      null,
      "a rejected video does not count as published",
    );
  });

  test("a thumbnail refusal warns without failing the publish", async () => {
    const { projectId } = await seedPublishable();
    const job = await createJob(projectId, { thumbnail: "render_poster" });

    await runPublishJob({
      jobId: job.id,
      client: new MockYouTubeClient({ stepDelayMs: 0 }),
      jobs,
      projects,
      renders,
      pollIntervalMs: 1,
    });

    const settled = await jobs.findById(job.id);
    assert.equal(settled?.status, "completed", "the video still published");
    // The seeded render has no poster, so no thumbnail is attempted at all.
    assert.equal(settled?.errorMessage, null);
  });

  test("refuses to upload when the rendered file is gone", async () => {
    const { projectId, fileName } = await seedPublishable();
    const job = await createJob(projectId);

    await rm(renderFilePath(fileName), { force: true });

    await runPublishJob({
      jobId: job.id,
      client: new MockYouTubeClient({ stepDelayMs: 0 }),
      jobs,
      projects,
      renders,
      pollIntervalMs: 1,
    });

    const settled = await jobs.findById(job.id);
    assert.equal(settled?.status, "failed");
    assert.match(settled?.errorMessage ?? "", /missing from disk|no finished render/i);
  });
});

describe("the mock uploader never passes for a real one", () => {
  test("its video id and URL are visibly not YouTube", async () => {
    const client = new MockYouTubeClient({ stepDelayMs: 0 });

    const result = await client.uploadVideo({
      filePath: "/dev/null",
      byteSize: 1,
      settings: SETTINGS,
      onProgress: () => {},
    });

    assert.match(result.videoId, /^mock-/);
    assert.match(result.videoUrl, /example\.invalid/);
    assert.ok(
      !result.videoUrl.includes("youtube.com"),
      "a plausible YouTube link would be mistaken for a real upload",
    );
  });

  test("it says so in the channel name and reports uploadsForReal false", async () => {
    const client = new MockYouTubeClient({ stepDelayMs: 0 });
    const channel = await client.getChannel();

    assert.equal(client.uploadsForReal, false);
    assert.match(channel.channelTitle, /mock/i);
  });
});

describe("stored tokens", () => {
  test("are encrypted at rest, not stored as written", async () => {
    const { encryptToken, decryptToken } = await import(
      "@/server/youtube/token-store"
    );

    const secret = "1//refresh-token-value";
    const stored = encryptToken(secret);

    assert.ok(!stored.includes(secret), "the plaintext is not in the stored value");
    assert.match(stored, /^v1\./);
    assert.equal(decryptToken(stored), secret);
  });

  test("encrypting the same token twice produces different bytes", async () => {
    const { encryptToken } = await import("@/server/youtube/token-store");

    assert.notEqual(encryptToken("same"), encryptToken("same"));
  });

  test("a tampered value fails to decrypt rather than decrypting wrongly", async () => {
    const { encryptToken, decryptToken } = await import(
      "@/server/youtube/token-store"
    );

    const stored = encryptToken("secret");
    const parts = stored.split(".");
    // Flip the ciphertext; GCM's tag should catch it.
    parts[3] = Buffer.from("tampered").toString("base64url");

    assert.throws(() => decryptToken(parts.join(".")));
  });

  test("the connection the API returns carries no token at all", async () => {
    await accounts.save({
      channelId: "UC123",
      channelTitle: "Korean Lab",
      scopes: ["https://www.googleapis.com/auth/youtube.upload"],
      accessToken: "access-secret",
      refreshToken: "refresh-secret",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });

    const connection = await accounts.getConnection();
    const serialised = JSON.stringify(connection);

    assert.ok(!serialised.includes("access-secret"));
    assert.ok(!serialised.includes("refresh-secret"));
    assert.equal(connection?.channelTitle, "Korean Lab");
  });

  test("the row holds ciphertext, and reading it back returns the token", async () => {
    await accounts.save({
      channelId: "UC456",
      channelTitle: "Second",
      scopes: [],
      accessToken: "access-secret-2",
      refreshToken: "refresh-secret-2",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });

    const row = await db.client.youTubeAccount.findUnique({ where: { id: "youtube" } });
    assert.ok(row);
    assert.ok(!row.accessTokenEncrypted.includes("access-secret-2"));
    assert.ok(!row.refreshTokenEncrypted.includes("refresh-secret-2"));

    const account = await accounts.getAccount();
    assert.equal(account?.accessToken, "access-secret-2");
    assert.equal(account?.refreshToken, "refresh-secret-2");
  });

  test("disconnecting removes the row", async () => {
    await accounts.save({
      channelId: "UC789",
      channelTitle: "Third",
      scopes: [],
      accessToken: "a",
      refreshToken: "b",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });

    await accounts.clear();
    assert.equal(await accounts.getConnection(), null);
  });
});
