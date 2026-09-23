import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { PrismaProjectRepository } from "@/server/repositories/prisma-project-repository";
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

describe("project persistence", () => {
  test("round-trips a project through the database", async () => {
    const project = makeProject({ topic: "Ordering coffee", level: "elementary" });
    await repository.create(project);

    const loaded = await repository.findById(project.id);

    assert.ok(loaded);
    assert.equal(loaded.topic, "Ordering coffee");
    assert.equal(loaded.level, "elementary");
    assert.equal(loaded.format, "shorts");
    assert.equal(loaded.shortsDurationSeconds, 30);
    assert.equal(loaded.longDurationSeconds, null);
    assert.equal(loaded.lesson, null);
    assert.equal(loaded.scenes, null);
  });

  test("updates only the fields supplied", async () => {
    const project = makeProject({ topic: "Before", description: "keep me" });
    await repository.create(project);

    const updated = await repository.update(project.id, { topic: "After" });

    assert.equal(updated?.topic, "After");
    assert.equal(updated?.description, "keep me", "untouched fields survive");
  });

  test("returns null when updating a project that does not exist", async () => {
    assert.equal(await repository.update("missing", { topic: "x" }), null);
  });

  test("delete removes the project and reports whether it existed", async () => {
    const project = makeProject();
    await repository.create(project);

    assert.equal(await repository.delete(project.id), true);
    assert.equal(await repository.findById(project.id), null);
    assert.equal(await repository.delete(project.id), false);
  });

  test("filters by status and searches title and topic", async () => {
    const match = makeProject({ topic: "Particles 은/는", status: "completed" });
    const other = makeProject({ topic: "Numbers", status: "draft" });
    await repository.create(match);
    await repository.create(other);

    const completed = await repository.list({ status: "completed" });
    assert.ok(completed.some((p) => p.id === match.id));
    assert.ok(!completed.some((p) => p.id === other.id));

    const searched = await repository.list({ search: "Particles" });
    assert.ok(searched.some((p) => p.id === match.id));
  });
});

describe("lesson persistence", () => {
  test("stores and reloads a lesson with its nested content", async () => {
    const project = makeProject();
    await repository.create(project);

    await repository.update(project.id, { lesson: makeLesson() });
    const loaded = await repository.findById(project.id);

    assert.ok(loaded?.lesson);
    assert.equal(loaded.lesson.content.title, "Korean Numbers 1-5");
    assert.equal(loaded.lesson.content.sections.length, 1);
    assert.equal(loaded.lesson.content.sections[0].korean, "하나");
    assert.equal(loaded.lesson.content.quiz[0].answer, "하나");
    assert.equal(loaded.lesson.model, "mock");
    assert.equal(loaded.lesson.editedAt, null);
  });

  test("replaces the lesson rather than accumulating copies", async () => {
    const project = makeProject();
    await repository.create(project);

    await repository.update(project.id, { lesson: makeLesson() });
    await repository.update(project.id, {
      lesson: makeLesson({
        content: { ...makeLesson().content, title: "Second lesson" },
      }),
    });

    const loaded = await repository.findById(project.id);
    assert.equal(loaded?.lesson?.content.title, "Second lesson");
    assert.equal(await db.client.lesson.count({ where: { projectId: project.id } }), 1);
  });
});

describe("scene persistence", () => {
  test("stores scenes in order and reloads them sorted", async () => {
    const project = makeProject();
    await repository.create(project);

    const scenes = [
      makeScene({ koreanText: "하나" }),
      makeScene({ koreanText: "둘" }),
      makeScene({ koreanText: "셋" }),
    ];
    await repository.update(project.id, { scenes: makeStoredScenes(scenes) });

    const loaded = await repository.findById(project.id);
    assert.equal(loaded?.scenes?.scenes.length, 3);
    assert.deepEqual(
      loaded?.scenes?.scenes.map((s) => s.koreanText),
      ["하나", "둘", "셋"],
    );
    assert.deepEqual(loaded?.scenes?.scenes.map((s) => s.order), [1, 2, 3]);
  });

  test("keeps per-scene highlight terms", async () => {
    const project = makeProject();
    await repository.create(project);

    const scene = makeScene({
      koreanText: "저는 김치를 좋아해요.",
      highlightTerms: ["김치"],
    });
    await repository.update(project.id, { scenes: makeStoredScenes([scene]) });

    const loaded = await repository.findById(project.id);
    assert.deepEqual(loaded?.scenes?.scenes[0].highlightTerms, ["김치"]);
  });

  test("removes scenes that are no longer in the storyboard", async () => {
    const project = makeProject();
    await repository.create(project);

    const first = makeScene({ koreanText: "하나" });
    const second = makeScene({ koreanText: "둘" });
    await repository.update(project.id, {
      scenes: makeStoredScenes([first, second]),
    });
    await repository.update(project.id, { scenes: makeStoredScenes([first]) });

    const loaded = await repository.findById(project.id);
    assert.equal(loaded?.scenes?.scenes.length, 1);
    assert.equal(loaded?.scenes?.scenes[0].id, first.id);
  });

  test("reordering keeps every scene", async () => {
    const project = makeProject();
    await repository.create(project);

    const a = makeScene({ koreanText: "하나" });
    const b = makeScene({ koreanText: "둘" });
    await repository.update(project.id, { scenes: makeStoredScenes([a, b]) });

    // Swapping puts two scenes on the same order for one statement, which is
    // why (storyboardId, order) must not be unique.
    await repository.update(project.id, { scenes: makeStoredScenes([b, a]) });

    const loaded = await repository.findById(project.id);
    assert.deepEqual(
      loaded?.scenes?.scenes.map((s) => s.koreanText),
      ["둘", "하나"],
    );
  });
});

describe("saving does not silently destroy existing data", () => {
  /**
   * Regression guard for the failure mode found during Step 6: scenes were
   * recreated on every project save, so generated audio was cascade-deleted by
   * edits that never touched the storyboard.
   */
  test("generated audio survives a lesson save", async () => {
    const project = makeProject();
    await repository.create(project);

    const scene = makeScene();
    await repository.update(project.id, { scenes: makeStoredScenes([scene]) });

    await db.client.sceneAudio.create({
      data: {
        sceneId: scene.id,
        fileName: "clip.wav",
        mimeType: "audio/wav",
        byteSize: 1024,
        durationSeconds: 1.5,
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

    // An edit that has nothing to do with the storyboard.
    await repository.update(project.id, { lesson: makeLesson() });

    const loaded = await repository.findById(project.id);
    assert.ok(loaded?.scenes?.scenes[0].audio, "audio must survive a lesson save");
    assert.equal(loaded.scenes.scenes[0].audio.byteSize, 1024);
  });

  test("generated audio survives a storyboard edit", async () => {
    const project = makeProject();
    await repository.create(project);

    const kept = makeScene({ koreanText: "하나" });
    const other = makeScene({ koreanText: "둘" });
    await repository.update(project.id, {
      scenes: makeStoredScenes([kept, other]),
    });

    await db.client.sceneAudio.create({
      data: {
        sceneId: kept.id,
        fileName: "kept.wav",
        mimeType: "audio/wav",
        byteSize: 2048,
        durationSeconds: 2,
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

    await repository.update(project.id, {
      scenes: makeStoredScenes([
        { ...kept, narration: "Edited narration." },
        other,
      ]),
    });

    const loaded = await repository.findById(project.id);
    const reloaded = loaded?.scenes?.scenes.find((s) => s.id === kept.id);
    assert.ok(reloaded?.audio, "audio must survive editing its own scene");
    assert.equal(reloaded.narration, "Edited narration.");
  });

  test("deleting a scene removes only that scene's audio", async () => {
    const project = makeProject();
    await repository.create(project);

    const removed = makeScene({ koreanText: "하나" });
    const kept = makeScene({ koreanText: "둘" });
    await repository.update(project.id, {
      scenes: makeStoredScenes([removed, kept]),
    });

    for (const scene of [removed, kept]) {
      await db.client.sceneAudio.create({
        data: {
          sceneId: scene.id,
          fileName: `${scene.id}.wav`,
          mimeType: "audio/wav",
          byteSize: 512,
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

    await repository.update(project.id, { scenes: makeStoredScenes([kept]) });

    const loaded = await repository.findById(project.id);
    assert.equal(loaded?.scenes?.scenes.length, 1);
    assert.ok(loaded?.scenes?.scenes[0].audio, "the kept scene keeps its audio");
    assert.equal(
      await db.client.sceneAudio.count({ where: { sceneId: removed.id } }),
      0,
      "the removed scene's audio is cleaned up",
    );
  });
});
