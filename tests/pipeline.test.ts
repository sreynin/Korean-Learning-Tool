import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { PrismaProjectRepository } from "@/server/repositories/prisma-project-repository";
import { reconcilePipeline } from "@/server/services/pipeline-service";
import { DEFAULT_CAPTION_SETTINGS } from "@/types/caption";
import {
  makeLesson,
  makeProject,
  makeScene,
  makeStoredScenes,
} from "./helpers/factories";
import { createTestDatabase } from "./helpers/test-db";
import type { TestDatabase } from "./helpers/test-db";

let db: TestDatabase;
let repository: PrismaProjectRepository;

before(() => {
  db = createTestDatabase();
  repository = new PrismaProjectRepository(db.client);
});

after(async () => {
  await db.dispose();
});

describe("stage status is derived from real content", () => {
  test("a bare project has only its topic complete", () => {
    const pipeline = reconcilePipeline(makeProject());

    assert.equal(pipeline.topic.status, "complete");
    assert.equal(pipeline.lesson.status, "pending");
    assert.equal(pipeline.scenes.status, "pending");
    assert.equal(pipeline.voice.status, "pending");
  });

  test("a lesson completes the lesson stage and nothing else", () => {
    const pipeline = reconcilePipeline(makeProject({ lesson: makeLesson() }));

    assert.equal(pipeline.lesson.status, "complete");
    assert.equal(pipeline.scenes.status, "pending");
  });

  test("scenes complete the scenes stage", () => {
    const project = makeProject({ scenes: makeStoredScenes([makeScene()]) });
    assert.equal(reconcilePipeline(project).scenes.status, "complete");
  });

  test("unimplemented stages can never be complete", () => {
    // Even when a stored record claims otherwise.
    const project = makeProject({
      lesson: makeLesson(),
      scenes: makeStoredScenes([makeScene()]),
    });
    project.pipeline.assets = { status: "complete", updatedAt: "2026-01-01T00:00:00.000Z" };
    project.pipeline.render = { status: "complete", updatedAt: "2026-01-01T00:00:00.000Z" };
    project.pipeline.youtube = { status: "complete", updatedAt: "2026-01-01T00:00:00.000Z" };

    const pipeline = reconcilePipeline(project);

    assert.equal(pipeline.assets.status, "pending");
    assert.equal(pipeline.render.status, "pending");
    assert.equal(pipeline.youtube.status, "pending");
  });

  test("removing an artifact reverts its stage", () => {
    const withLesson = makeProject({ lesson: makeLesson() });
    const reconciled = reconcilePipeline(withLesson);
    assert.equal(reconciled.lesson.status, "complete");

    const cleared = reconcilePipeline({
      ...withLesson,
      lesson: null,
      pipeline: reconciled,
    });
    assert.equal(cleared.lesson.status, "pending");
    assert.equal(cleared.lesson.updatedAt, null);
  });

  test("an unchanged stage keeps its original timestamp", () => {
    const project = makeProject({ lesson: makeLesson() });
    const first = reconcilePipeline(project, "2026-01-01T00:00:00.000Z");
    const second = reconcilePipeline(
      { ...project, pipeline: first },
      "2026-06-01T00:00:00.000Z",
    );

    assert.equal(second.lesson.updatedAt, "2026-01-01T00:00:00.000Z");
  });
});

describe("voice stage", () => {
  test("is in progress while only some scenes have audio", () => {
    const withAudio = makeScene({
      audio: {
        url: "/api/audio/a.wav",
        mimeType: "audio/wav",
        byteSize: 1,
        durationSeconds: 1,
        settings: { language: "english", voiceId: "v", speed: 1, pitch: 0, volume: 1 },
        voiceName: "Ava",
        provider: "mock",
        generatedAt: new Date().toISOString(),
      },
    });

    const project = makeProject({
      scenes: makeStoredScenes([withAudio, makeScene()]),
    });

    assert.equal(reconcilePipeline(project).voice.status, "in_progress");
  });

  test("completes only when every scene has audio", () => {
    const audio = {
      url: "/api/audio/a.wav",
      mimeType: "audio/wav",
      byteSize: 1,
      durationSeconds: 1,
      settings: { language: "english" as const, voiceId: "v", speed: 1, pitch: 0, volume: 1 },
      voiceName: "Ava",
      provider: "mock",
      generatedAt: new Date().toISOString(),
    };

    const project = makeProject({
      scenes: makeStoredScenes([makeScene({ audio }), makeScene({ audio })]),
    });

    assert.equal(reconcilePipeline(project).voice.status, "complete");
  });
});

describe("captions and preview complete only on a real action", () => {
  test("captions stay pending while settings are merely defaults", () => {
    const project = makeProject({
      scenes: makeStoredScenes([makeScene()]),
      captionSettings: DEFAULT_CAPTION_SETTINGS,
      captionsConfigured: false,
    });

    assert.equal(reconcilePipeline(project).captions.status, "pending");
  });

  test("captions complete once settings are saved and scenes exist", () => {
    const project = makeProject({
      scenes: makeStoredScenes([makeScene()]),
      captionsConfigured: true,
    });

    assert.equal(reconcilePipeline(project).captions.status, "complete");
  });

  test("captions cannot complete without a storyboard to caption", () => {
    const project = makeProject({ scenes: null, captionsConfigured: true });
    assert.equal(reconcilePipeline(project).captions.status, "pending");
  });

  test("preview stays pending until explicitly reviewed", () => {
    const project = makeProject({ scenes: makeStoredScenes([makeScene()]) });
    assert.equal(reconcilePipeline(project).preview.status, "pending");
  });

  test("preview completes once reviewed", () => {
    const project = makeProject({
      scenes: makeStoredScenes([makeScene()]),
      previewReviewedAt: new Date().toISOString(),
    });

    assert.equal(reconcilePipeline(project).preview.status, "complete");
  });

  test("preview cannot complete without a storyboard", () => {
    const project = makeProject({
      scenes: null,
      previewReviewedAt: new Date().toISOString(),
    });

    assert.equal(reconcilePipeline(project).preview.status, "pending");
  });
});

describe("stage markers persist", () => {
  test("captionsConfigured and previewReviewedAt round-trip", async () => {
    const project = makeProject();
    await repository.create(project);

    let loaded = await repository.findById(project.id);
    assert.equal(loaded?.captionsConfigured, false, "defaults are not 'configured'");
    assert.equal(loaded?.previewReviewedAt, null);

    const reviewedAt = new Date().toISOString();
    await repository.update(project.id, {
      captionsConfigured: true,
      captionSettings: { ...DEFAULT_CAPTION_SETTINGS, fontSize: "large" },
      previewReviewedAt: reviewedAt,
    });

    loaded = await repository.findById(project.id);
    assert.equal(loaded?.captionsConfigured, true);
    assert.equal(loaded?.captionSettings.fontSize, "large");
    assert.equal(loaded?.previewReviewedAt, reviewedAt);
  });
});
