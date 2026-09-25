import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { PrismaProjectRepository } from "@/server/repositories/prisma-project-repository";
import { RenderJobRepository } from "@/server/repositories/render-job-repository";
import { runRenderJob } from "@/server/render/render-queue";
import { reconcilePipeline } from "@/server/services/pipeline-service";
import type { RenderRequest, RenderResult, Renderer } from "@/server/render/renderer";
import { makeLesson, makeProject, makeScene, makeStoredScenes } from "./helpers/factories";
import { createTestDatabase } from "./helpers/test-db";
import type { TestDatabase } from "./helpers/test-db";

let db: TestDatabase;
let projects: PrismaProjectRepository;
let jobs: RenderJobRepository;

before(() => {
  db = createTestDatabase();
  projects = new PrismaProjectRepository(db.client);
  jobs = new RenderJobRepository(db.client);
});

after(async () => {
  await db.dispose();
});

/** Records progress and succeeds. No FFmpeg, no encoding. */
class SucceedingRenderer implements Renderer {
  readonly name = "test-success";
  readonly reported: number[] = [];

  async render(request: RenderRequest): Promise<RenderResult> {
    for (const percent of [10, 50, 100]) {
      this.reported.push(percent);
      await request.onProgress(percent);
    }
    return {
      outputFileName: `${request.jobId}.mp4`,
      posterFileName: null,
      contentType: "video/mp4",
      byteSize: 2048,
    };
  }
}

class FailingRenderer implements Renderer {
  readonly name = "test-failure";

  async render(request: RenderRequest): Promise<RenderResult> {
    await request.onProgress(25);
    throw new Error("Encoder exploded");
  }
}

async function seedRenderableProject() {
  const project = makeProject({ lesson: makeLesson() });
  await projects.create(project);
  await projects.update(project.id, {
    lesson: makeLesson(),
    scenes: makeStoredScenes([makeScene(), makeScene({ koreanText: "둘" })]),
  });
  return project.id;
}

describe("creating a render job", () => {
  test("creates a pending job with no output", async () => {
    const projectId = await seedRenderableProject();

    const job = await jobs.createIfIdle(projectId, "shorts");

    assert.ok(job);
    assert.equal(job.status, "pending");
    assert.equal(job.progress, 0);
    assert.equal(job.outputUrl, null);
    assert.equal(job.errorMessage, null);
    assert.equal(job.startedAt, null);
    assert.equal(job.completedAt, null);
  });

  test("refuses a second job while one is active", async () => {
    const projectId = await seedRenderableProject();

    const first = await jobs.createIfIdle(projectId, "shorts");
    const second = await jobs.createIfIdle(projectId, "shorts");

    assert.ok(first);
    assert.equal(second, null, "duplicate renders are refused");
  });

  test("allows a new job once the previous one finished", async () => {
    const projectId = await seedRenderableProject();

    const first = await jobs.createIfIdle(projectId, "shorts");
    await jobs.markFailed(first!.id, "nope");

    const second = await jobs.createIfIdle(projectId, "shorts");
    assert.ok(second, "a settled job releases the slot");
  });
});

describe("status transitions", () => {
  test("moves pending → queued → processing → completed", async () => {
    const projectId = await seedRenderableProject();
    const job = (await jobs.createIfIdle(projectId, "shorts"))!;

    await jobs.markQueued(job.id);
    assert.equal((await jobs.findById(job.id))?.status, "queued");

    assert.equal(await jobs.claim(job.id), true);
    const processing = await jobs.findById(job.id);
    assert.equal(processing?.status, "processing");
    assert.ok(processing?.startedAt, "startedAt is recorded on claim");

    await jobs.markCompleted(job.id, {
      fileName: "out.mp4",
      contentType: "video/mp4",
      byteSize: 4096,
    });
    const done = await jobs.findById(job.id);
    assert.equal(done?.status, "completed");
    assert.equal(done?.progress, 100);
    assert.equal(done?.outputUrl, "/api/renders/out.mp4");
    assert.equal(done?.contentType, "video/mp4");
    assert.equal(done?.byteSize, 4096);
    assert.ok(done?.completedAt);
  });

  test("a job can only be claimed once", async () => {
    const projectId = await seedRenderableProject();
    const job = (await jobs.createIfIdle(projectId, "shorts"))!;

    assert.equal(await jobs.claim(job.id), true);
    assert.equal(await jobs.claim(job.id), false, "a second worker loses");
  });

  test("failure records the reason and a completion time", async () => {
    const projectId = await seedRenderableProject();
    const job = (await jobs.createIfIdle(projectId, "shorts"))!;

    await jobs.claim(job.id);
    await jobs.markFailed(job.id, "Encoder exploded");

    const failed = await jobs.findById(job.id);
    assert.equal(failed?.status, "failed");
    assert.equal(failed?.errorMessage, "Encoder exploded");
    assert.ok(failed?.completedAt);
    assert.equal(failed?.outputUrl, null);
  });
});

describe("progress", () => {
  test("updates while processing and never moves backwards", async () => {
    const projectId = await seedRenderableProject();
    const job = (await jobs.createIfIdle(projectId, "shorts"))!;
    await jobs.claim(job.id);

    await jobs.updateProgress(job.id, 25);
    assert.equal((await jobs.findById(job.id))?.progress, 25);

    await jobs.updateProgress(job.id, 75);
    assert.equal((await jobs.findById(job.id))?.progress, 75);

    // A late report from a slow step must not rewind the bar.
    await jobs.updateProgress(job.id, 50);
    assert.equal((await jobs.findById(job.id))?.progress, 75);
  });

  test("is ignored for a job that is not processing", async () => {
    const projectId = await seedRenderableProject();
    const job = (await jobs.createIfIdle(projectId, "shorts"))!;

    await jobs.updateProgress(job.id, 50);
    assert.equal((await jobs.findById(job.id))?.progress, 0);
  });
});

describe("running a job through the queue", () => {
  test("a successful render reports progress and stores output", async () => {
    const projectId = await seedRenderableProject();
    const job = (await jobs.createIfIdle(projectId, "shorts"))!;
    const renderer = new SucceedingRenderer();

    await runRenderJob({ jobId: job.id, renderer, jobs, projects });

    const settled = await jobs.findById(job.id);
    assert.equal(settled?.status, "completed");
    assert.equal(settled?.progress, 100);
    assert.ok(settled?.outputUrl?.endsWith(".mp4"));
    assert.equal(settled?.contentType, "video/mp4");
    assert.deepEqual(renderer.reported, [10, 50, 100]);
  });

  test("a failed render marks only the job and keeps the message", async () => {
    const projectId = await seedRenderableProject();
    const job = (await jobs.createIfIdle(projectId, "shorts"))!;

    await runRenderJob({ jobId: job.id, renderer: new FailingRenderer(), jobs, projects });

    const settled = await jobs.findById(job.id);
    assert.equal(settled?.status, "failed");
    assert.equal(settled?.errorMessage, "Encoder exploded");
    assert.equal(settled?.outputUrl, null);
  });
});

describe("a failed render does not destroy project data", () => {
  test("lesson, scenes, captions, and audio all survive", async () => {
    const projectId = await seedRenderableProject();

    const before = await projects.findById(projectId);
    const sceneId = before!.scenes!.scenes[0].id;

    await db.client.sceneAudio.create({
      data: {
        sceneId,
        fileName: "clip.wav",
        mimeType: "audio/wav",
        byteSize: 128,
        durationSeconds: 1,
        language: "english",
        voiceId: "en-female-natural",
        voiceName: "Ava",
        speed: 1,
        pitch: 0,
        volume: 1,
        provider: "mock",
        generatedAt: new Date(),
      },
    });
    await projects.update(projectId, { captionsConfigured: true });

    const job = (await jobs.createIfIdle(projectId, "shorts"))!;
    await runRenderJob({ jobId: job.id, renderer: new FailingRenderer(), jobs, projects });

    const after = await projects.findById(projectId);
    assert.ok(after?.lesson, "lesson survives");
    assert.equal(after?.scenes?.scenes.length, 2, "scenes survive");
    assert.ok(after?.scenes?.scenes[0].audio, "generated audio survives");
    assert.equal(after?.captionsConfigured, true, "caption settings survive");
    assert.equal(after?.title, before?.title);
  });

  test("a failed retry keeps an earlier successful render", async () => {
    const projectId = await seedRenderableProject();

    const first = (await jobs.createIfIdle(projectId, "shorts"))!;
    await runRenderJob({ jobId: first.id, renderer: new SucceedingRenderer(), jobs, projects });

    const second = (await jobs.createIfIdle(projectId, "shorts"))!;
    await runRenderJob({ jobId: second.id, renderer: new FailingRenderer(), jobs, projects });

    const project = await projects.findById(projectId);
    assert.equal(project?.hasRenderOutput, true, "the earlier output still counts");
    assert.equal(
      reconcilePipeline(project!).render.status,
      "complete",
      "a failed retry does not erase a finished render",
    );
  });
});

describe("render stage status", () => {
  test("is pending with no job", () => {
    const project = makeProject({ scenes: makeStoredScenes([makeScene()]) });
    assert.equal(reconcilePipeline(project).render.status, "pending");
  });

  test("is in progress while a job is active", async () => {
    const projectId = await seedRenderableProject();
    await jobs.createIfIdle(projectId, "shorts");

    const project = await projects.findById(projectId);
    assert.equal(reconcilePipeline(project!).render.status, "in_progress");
  });

  test("is complete once a render produces output", async () => {
    const projectId = await seedRenderableProject();
    const job = (await jobs.createIfIdle(projectId, "shorts"))!;
    await runRenderJob({ jobId: job.id, renderer: new SucceedingRenderer(), jobs, projects });

    const project = await projects.findById(projectId);
    assert.equal(reconcilePipeline(project!).render.status, "complete");
  });

  test("returns to pending when the only job failed", async () => {
    const projectId = await seedRenderableProject();
    const job = (await jobs.createIfIdle(projectId, "shorts"))!;
    await runRenderJob({ jobId: job.id, renderer: new FailingRenderer(), jobs, projects });

    const project = await projects.findById(projectId);
    assert.equal(
      reconcilePipeline(project!).render.status,
      "pending",
      "a failure produced nothing, so the stage is not complete",
    );
  });

  test("the stored pipeline settles with the job, not just the derived one", async () => {
    const projectId = await seedRenderableProject();

    const completed = (await jobs.createIfIdle(projectId, "shorts"))!;
    await runRenderJob({
      jobId: completed.id,
      renderer: new SucceedingRenderer(),
      jobs,
      projects,
    });
    assert.equal(
      (await projects.findById(projectId))?.pipeline.render.status,
      "complete",
      "a finished render is persisted, not left claiming to be in progress",
    );

    const failed = (await jobs.createIfIdle(projectId, "shorts"))!;
    await runRenderJob({
      jobId: failed.id,
      renderer: new FailingRenderer(),
      jobs,
      projects,
    });
    assert.equal(
      (await projects.findById(projectId))?.pipeline.render.status,
      "complete",
      "the earlier output keeps the stage complete after a failed retry",
    );
  });

  test("creating a job alone never marks the stage complete", async () => {
    const projectId = await seedRenderableProject();
    await jobs.createIfIdle(projectId, "shorts");

    const project = await projects.findById(projectId);
    assert.notEqual(reconcilePipeline(project!).render.status, "complete");
  });
});
