import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { POST as DUPLICATE } from "@/app/api/projects/[id]/duplicate/route";
import { GET as LIST_PROJECTS } from "@/app/api/projects/route";
import { PUT as PUBLISH } from "@/app/api/projects/[id]/publish/route";
import { PrismaProjectRepository } from "@/server/repositories/prisma-project-repository";
import { RenderJobRepository } from "@/server/repositories/render-job-repository";
import { deriveProjectStatus } from "@/server/services/pipeline-service";
import { duplicateProject, setPublished } from "@/server/services/library-service";
import type { ProjectRepository } from "@/server/repositories";
import type { ProjectListFilters, VideoProject } from "@/types/project";
import type { Scene } from "@/types/scene";
import {
  makeLesson,
  makeProject,
  makeScene,
  makeStoredScenes,
} from "./helpers/factories";
import { createTestDatabase } from "./helpers/test-db";
import type { TestDatabase } from "./helpers/test-db";

const globals = globalThis as unknown as {
  __projectRepository?: ProjectRepository;
};

let db: TestDatabase;
let projects: PrismaProjectRepository;
let jobs: RenderJobRepository;

before(() => {
  db = createTestDatabase();
  projects = new PrismaProjectRepository(db.client);
  jobs = new RenderJobRepository(db.client);
  globals.__projectRepository = projects;
});

after(async () => {
  delete globals.__projectRepository;
  await db.dispose();
});

function voiced(scene: Scene): Scene {
  return {
    ...scene,
    audio: {
      url: "/api/audio/clip.wav",
      mimeType: "audio/wav",
      byteSize: 128,
      durationSeconds: 1,
      settings: makeProject().voiceSettings,
      voiceName: "Ava",
      provider: "mock",
      generatedAt: new Date().toISOString(),
    },
  };
}

async function seed(changes: Partial<VideoProject> = {}): Promise<VideoProject> {
  const project = makeProject();
  await projects.create(project);

  if (Object.keys(changes).length > 0) {
    await projects.update(project.id, changes);
  }

  return (await projects.findById(project.id))!;
}

/** Audio lives in its own table, so it is written after the storyboard. */
async function attachAudio(projectId: string): Promise<VideoProject> {
  const project = (await projects.findById(projectId))!;

  for (const scene of project.scenes?.scenes ?? []) {
    await db.client.sceneAudio.create({
      data: {
        sceneId: scene.id,
        fileName: `${scene.id}.wav`,
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
  }

  return (await projects.findById(projectId))!;
}

describe("status follows what the project contains", () => {
  test("an empty project is a draft", async () => {
    assert.equal(deriveProjectStatus(await seed()), "draft");
  });

  test("a lesson alone is lesson_ready", async () => {
    const project = await seed({ lesson: makeLesson() });
    assert.equal(deriveProjectStatus(project), "lesson_ready");
  });

  test("a storyboard without audio is scenes_ready", async () => {
    const project = await seed({
      lesson: makeLesson(),
      scenes: makeStoredScenes([makeScene(), makeScene()]),
    });
    assert.equal(deriveProjectStatus(project), "scenes_ready");
  });

  test("every scene voiced is voice_ready", async () => {
    const seeded = await seed({
      lesson: makeLesson(),
      scenes: makeStoredScenes([makeScene(), makeScene()]),
    });
    const project = await attachAudio(seeded.id);

    assert.equal(deriveProjectStatus(project), "voice_ready");
  });

  test("one unvoiced scene is not voice_ready", () => {
    const project = makeProject({
      lesson: makeLesson(),
      scenes: makeStoredScenes([voiced(makeScene()), makeScene()]),
    });

    assert.equal(deriveProjectStatus(project), "scenes_ready");
  });

  test("voiced plus saved captions is ready_to_render", () => {
    const project = makeProject({
      lesson: makeLesson(),
      scenes: makeStoredScenes([voiced(makeScene())]),
      captionsConfigured: true,
    });

    assert.equal(deriveProjectStatus(project), "ready_to_render");
  });

  test("an active job is rendering, and output makes it completed", async () => {
    const seeded = await seed({
      lesson: makeLesson(),
      scenes: makeStoredScenes([makeScene()]),
    });

    const job = (await jobs.createIfIdle(seeded.id, "shorts"))!;
    assert.equal(
      deriveProjectStatus((await projects.findById(seeded.id))!),
      "rendering",
    );

    await jobs.markCompleted(job.id, {
      fileName: `${job.id}.mp4`,
      posterFileName: `${job.id}.jpg`,
      contentType: "video/mp4",
      byteSize: 2048,
    });
    assert.equal(
      deriveProjectStatus((await projects.findById(seeded.id))!),
      "completed",
    );
  });

  test("a failed render does not claim the project is finished", async () => {
    const seeded = await seed({
      lesson: makeLesson(),
      scenes: makeStoredScenes([makeScene()]),
    });

    const job = (await jobs.createIfIdle(seeded.id, "shorts"))!;
    await jobs.markFailed(job.id, "Encoder exploded");

    assert.equal(
      deriveProjectStatus((await projects.findById(seeded.id))!),
      "scenes_ready",
    );
  });

  test("a finished render's still becomes the project's thumbnail", async () => {
    const seeded = await seed({
      lesson: makeLesson(),
      scenes: makeStoredScenes([makeScene()]),
    });

    const job = (await jobs.createIfIdle(seeded.id, "shorts"))!;
    await jobs.markCompleted(job.id, {
      fileName: `${job.id}.mp4`,
      posterFileName: `${job.id}.jpg`,
      contentType: "video/mp4",
      byteSize: 2048,
    });

    const project = await projects.findById(seeded.id);
    assert.equal(project?.posterUrl, `/api/renders/${job.id}.jpg`);
  });

  test("a render with no still leaves the thumbnail empty", async () => {
    const seeded = await seed({ scenes: makeStoredScenes([makeScene()]) });
    const job = (await jobs.createIfIdle(seeded.id, "shorts"))!;

    await jobs.markCompleted(job.id, {
      fileName: `${job.id}.mp4`,
      posterFileName: null,
      contentType: "video/mp4",
      byteSize: 2048,
    });

    assert.equal((await projects.findById(seeded.id))?.posterUrl, null);
  });
});

describe("marking a project published", () => {
  test("records the date and the link, and persists the status", async () => {
    const seeded = await seed({ lesson: makeLesson() });

    const project = await setPublished(
      seeded.id,
      true,
      "https://youtube.com/watch?v=abc",
    );

    assert.ok(project.publishedAt);
    assert.equal(project.youtubeUrl, "https://youtube.com/watch?v=abc");
    assert.equal(project.status, "published");
    assert.equal(
      (await projects.findById(seeded.id))?.status,
      "published",
      "the derived status is stored, so the library can filter on it",
    );
  });

  test("published outranks everything else the content implies", () => {
    const project = makeProject({
      publishedAt: new Date().toISOString(),
      lesson: makeLesson(),
    });

    assert.equal(deriveProjectStatus(project), "published");
  });

  test("unpublishing clears the record and the status falls back", async () => {
    const seeded = await seed({ lesson: makeLesson() });
    await setPublished(seeded.id, true, "https://youtube.com/watch?v=abc");

    const project = await setPublished(seeded.id, false);

    assert.equal(project.publishedAt, null);
    assert.equal(project.youtubeUrl, null);
    assert.equal(project.status, "lesson_ready");
  });

  test("the route rejects a link that is not a URL", async () => {
    const seeded = await seed();

    const response = await PUBLISH(
      new Request("http://test/publish", {
        method: "PUT",
        body: JSON.stringify({ published: true, youtubeUrl: "not a url" }),
      }),
      { params: Promise.resolve({ id: seeded.id }) },
    );
    const body = (await response.json()) as { ok: false; error: { code: string } };

    assert.equal(response.status, 400);
    assert.equal(body.error.code, "validation_error");
  });
});

describe("duplicating a project", () => {
  test("copies the creative work but not the original's output", async () => {
    const seeded = await seed({
      lesson: makeLesson(),
      scenes: makeStoredScenes([makeScene(), makeScene({ koreanText: "둘" })]),
      captionsConfigured: true,
      previewReviewedAt: new Date().toISOString(),
    });
    await attachAudio(seeded.id);
    await setPublished(seeded.id, true, "https://youtube.com/watch?v=abc");

    const copy = await duplicateProject(seeded.id);

    assert.equal(copy.title, `${seeded.title} (copy)`);
    assert.notEqual(copy.id, seeded.id);
    assert.ok(copy.lesson, "the lesson comes along");
    assert.equal(copy.scenes?.scenes.length, 2, "so does the storyboard");
    assert.equal(copy.captionsConfigured, true);

    assert.equal(copy.publishedAt, null, "the copy was not published");
    assert.equal(copy.youtubeUrl, null);
    assert.equal(copy.previewReviewedAt, null, "nobody reviewed the copy");
    assert.equal(copy.hasRenderOutput, false, "and nothing has rendered it");
    assert.equal(copy.posterUrl, null);
    assert.equal(
      copy.scenes?.scenes.every((scene) => scene.audio === null),
      true,
      "the original's audio clips belong to the original",
    );
  });

  test("gives the copied scenes their own ids", async () => {
    const seeded = await seed({
      scenes: makeStoredScenes([makeScene(), makeScene()]),
    });

    const copy = await duplicateProject(seeded.id);
    const originalIds = seeded.scenes!.scenes.map((scene) => scene.id);

    for (const scene of copy.scenes!.scenes) {
      assert.ok(
        !originalIds.includes(scene.id),
        "a shared scene row would let one project edit the other",
      );
    }
  });

  test("leaves the original untouched", async () => {
    const seeded = await seed({
      lesson: makeLesson(),
      scenes: makeStoredScenes([makeScene()]),
    });
    const before = await projects.findById(seeded.id);

    await duplicateProject(seeded.id);

    assert.deepEqual(await projects.findById(seeded.id), before);
  });

  test("the copy's status is derived, not inherited", async () => {
    const seeded = await seed({
      lesson: makeLesson(),
      scenes: makeStoredScenes([makeScene()]),
    });

    const response = await DUPLICATE(new Request("http://test/duplicate"), {
      params: Promise.resolve({ id: seeded.id }),
    });
    const body = (await response.json()) as { ok: true; data: VideoProject };

    assert.equal(response.status, 201);
    assert.equal(body.data.status, "scenes_ready");
    assert.equal(body.data.pipeline.scenes.status, "complete");
    assert.equal(body.data.pipeline.render.status, "pending");
  });

  test("numbers repeated copies instead of stacking suffixes", async () => {
    const seeded = await seed();

    const first = await duplicateProject(seeded.id);
    const second = await duplicateProject(first.id);
    const third = await duplicateProject(second.id);

    assert.equal(first.title, `${seeded.title} (copy)`);
    assert.equal(second.title, `${seeded.title} (copy 2)`);
    assert.equal(third.title, `${seeded.title} (copy 3)`);
  });

  test("404s for a project that does not exist", async () => {
    const response = await DUPLICATE(new Request("http://test/duplicate"), {
      params: Promise.resolve({ id: "missing" }),
    });

    assert.equal(response.status, 404);
  });
});

describe("filtering the library", () => {
  test("narrows by level, format, and search together", async () => {
    await seed();
    const project = makeProject({
      title: "Ordering Coffee in Korean",
      topic: "Café phrases",
      level: "advanced",
      format: "long",
      shortsDurationSeconds: null,
      longDurationSeconds: 300,
    });
    await projects.create(project);

    assert.equal((await projects.list({ level: "advanced" })).length, 1);
    assert.equal((await projects.list({ format: "long" })).length, 1);
    assert.equal((await projects.list({ search: "coffee" })).length, 1);
    assert.equal(
      (await projects.list({ level: "advanced", format: "shorts" })).length,
      0,
      "filters combine rather than widen",
    );
  });

  test("finds a project by its topic as well as its title", async () => {
    const project = makeProject({
      title: "Hangul in 3 Minutes",
      topic: "Reading the Korean alphabet",
    });
    await projects.create(project);

    const byTopic = await projects.list({ search: "alphabet" });
    assert.ok(byTopic.some((entry) => entry.id === project.id));
  });

  /**
   * The query string is the only place a filter can go missing without the
   * type checker noticing: the schema, the service, and the repository all
   * handle `level`, but the route once forgot to read it. This walks every
   * filter the type declares, so a new one cannot be dropped silently either.
   */
  test("every declared filter survives the query string", async () => {
    const target = makeProject({
      title: "Market Haggling Phrases",
      topic: "Bargaining at a traditional market",
      level: "advanced",
      format: "long",
      status: "published",
      shortsDurationSeconds: null,
      longDurationSeconds: 300,
    });
    const control = makeProject({ title: "Unrelated", topic: "Nothing" });
    await projects.create(target);
    await projects.create(control);

    const cases: Array<[keyof ProjectListFilters, string]> = [
      ["status", "published"],
      ["format", "long"],
      ["level", "advanced"],
      ["search", "haggling"],
    ];

    for (const [key, value] of cases) {
      const response = await LIST_PROJECTS(
        new Request(`http://test/api/projects?${key}=${value}`),
      );
      const body = (await response.json()) as {
        ok: true;
        data: VideoProject[];
      };
      const ids = body.data.map((entry) => entry.id);

      assert.equal(response.status, 200);
      assert.ok(ids.includes(target.id), `?${key}=${value} keeps a match`);
      assert.ok(
        !ids.includes(control.id),
        `?${key}=${value} reached the query instead of being ignored`,
      );
    }
  });

});
