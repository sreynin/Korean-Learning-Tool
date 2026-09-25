import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { PrismaProjectRepository } from "@/server/repositories/prisma-project-repository";
import { PublishJobRepository } from "@/server/repositories/publish-job-repository";
import { RenderJobRepository } from "@/server/repositories/render-job-repository";
import { ConcurrencyGate } from "@/server/render/render-queue";
import {
  GENERATION_LIMIT,
  RateLimitError,
  enforceRateLimit,
  resetRateLimits,
} from "@/server/rate-limit";
import type { PublishSettings } from "@/types/youtube";
import { makeLesson, makeProject, makeScene, makeStoredScenes } from "./helpers/factories";
import { createTestDatabase } from "./helpers/test-db";
import type { TestDatabase } from "./helpers/test-db";

let db: TestDatabase;
let projects: PrismaProjectRepository;
let renders: RenderJobRepository;
let publishes: PublishJobRepository;

before(() => {
  db = createTestDatabase();
  projects = new PrismaProjectRepository(db.client);
  renders = new RenderJobRepository(db.client);
  publishes = new PublishJobRepository(db.client);
});

after(async () => {
  await db.dispose();
});

async function seedProject() {
  const project = makeProject();
  await projects.create(project);
  await projects.update(project.id, {
    lesson: makeLesson(),
    scenes: makeStoredScenes([makeScene()]),
  });
  return project.id;
}

const SETTINGS: PublishSettings = {
  title: "Title",
  description: "",
  tags: [],
  visibility: "private",
  categoryId: "27",
  language: "en",
  thumbnail: "none",
};

/**
 * Pretends a job was claimed long ago, the way a process that died mid-render
 * would leave it.
 */
async function backdate(table: "renderJob" | "publishJob", id: string, ageMs: number) {
  const when = new Date(Date.now() - ageMs);
  const data = { startedAt: when, createdAt: when };

  // Branching rather than indexing: the two delegates have different argument
  // types, so a dynamic lookup gives a union TypeScript cannot call.
  if (table === "renderJob") {
    await db.client.renderJob.update({ where: { id }, data });
  } else {
    await db.client.publishJob.update({ where: { id }, data });
  }
}

describe("a job abandoned by a crashed process", () => {
  test("used to lock the project out of rendering for ever — now it is released", async () => {
    const projectId = await seedProject();

    const abandoned = (await renders.createIfIdle(projectId, "shorts"))!;
    await renders.claim(abandoned.id);
    await backdate("renderJob", abandoned.id, 60 * 60 * 1000);

    // Before the fix this returned null for ever, with nothing to clear it.
    const fresh = await renders.createIfIdle(projectId, "shorts");

    assert.ok(fresh, "a new render can be started");
    assert.equal(
      (await renders.findById(abandoned.id))?.status,
      "failed",
      "the abandoned job is settled, not left claiming to run",
    );
  });

  test("a job that is merely slow is left alone", async () => {
    const projectId = await seedProject();

    const running = (await renders.createIfIdle(projectId, "shorts"))!;
    await renders.claim(running.id);

    assert.equal(
      await renders.createIfIdle(projectId, "shorts"),
      null,
      "a genuinely running render still holds the slot",
    );
    assert.equal((await renders.findById(running.id))?.status, "processing");
  });

  test("a queued job that was never picked up is released too", async () => {
    const projectId = await seedProject();

    const stranded = (await renders.createIfIdle(projectId, "shorts"))!;
    await renders.markQueued(stranded.id);
    await backdate("renderJob", stranded.id, 60 * 60 * 1000);

    assert.ok(await renders.createIfIdle(projectId, "shorts"));
    assert.equal((await renders.findById(stranded.id))?.status, "failed");
  });

  test("an abandoned publish that already uploaded names the video", async () => {
    const projectId = await seedProject();

    const job = (await publishes.createIfIdle({
      projectId,
      format: "shorts",
      settings: SETTINGS,
      provider: "mock",
    }))!;
    await publishes.claim(job.id);
    await publishes.markProcessing(job.id, {
      videoId: "abc123",
      videoUrl: "https://example.invalid/abc123",
      publishedAt: new Date().toISOString(),
      visibility: "private",
    });
    await backdate("publishJob", job.id, 3 * 60 * 60 * 1000);

    await publishes.expireStale();
    const settled = await publishes.findById(job.id);

    assert.equal(settled?.status, "failed");
    assert.match(
      settled?.errorMessage ?? "",
      /abc123/,
      "the id is in the message so the creator can find the video",
    );
    assert.match(settled?.errorMessage ?? "", /twice/, "and is warned not to re-upload");
  });

  test("an abandoned publish that never uploaded just says to retry", async () => {
    const projectId = await seedProject();

    const job = (await publishes.createIfIdle({
      projectId,
      format: "shorts",
      settings: SETTINGS,
      provider: "mock",
    }))!;
    await publishes.claim(job.id);
    await backdate("publishJob", job.id, 3 * 60 * 60 * 1000);

    await publishes.expireStale();
    const settled = await publishes.findById(job.id);

    assert.equal(settled?.status, "failed");
    assert.match(settled?.errorMessage ?? "", /Start it again/);
  });
});

describe("concurrency gate", () => {
  test("never runs more than the limit at once", async () => {
    const gate = new ConcurrencyGate(2);
    let active = 0;
    let peak = 0;

    await Promise.all(
      Array.from({ length: 8 }, () =>
        gate.run(async () => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 5));
          active -= 1;
        }),
      ),
    );

    assert.equal(peak, 2, "two at a time, never three");
    assert.equal(active, 0, "everything finished");
  });

  test("a failing task releases its slot", async () => {
    const gate = new ConcurrencyGate(1);

    await assert.rejects(() =>
      gate.run(async () => {
        throw new Error("boom");
      }),
    );

    // Would hang for ever if the slot leaked.
    assert.equal(await gate.run(async () => "ok"), "ok");
  });

  test("queued tasks all eventually run", async () => {
    const gate = new ConcurrencyGate(2);
    const done: number[] = [];

    await Promise.all(
      Array.from({ length: 6 }, (_unused, index) =>
        gate.run(async () => {
          done.push(index);
        }),
      ),
    );

    assert.equal(done.length, 6);
  });
});

describe("rate limiting the routes that cost money", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  test("allows a normal working session", () => {
    for (let call = 0; call < GENERATION_LIMIT.limit; call += 1) {
      assert.doesNotThrow(() => enforceRateLimit("test", GENERATION_LIMIT));
    }
  });

  test("stops a runaway loop once the window is full", () => {
    for (let call = 0; call < GENERATION_LIMIT.limit; call += 1) {
      enforceRateLimit("test", GENERATION_LIMIT);
    }

    assert.throws(
      () => enforceRateLimit("test", GENERATION_LIMIT),
      (error: unknown) =>
        error instanceof RateLimitError && error.status === 429,
    );
  });

  test("separate routes have separate budgets", () => {
    for (let call = 0; call < GENERATION_LIMIT.limit; call += 1) {
      enforceRateLimit("lesson", GENERATION_LIMIT);
    }

    assert.doesNotThrow(() => enforceRateLimit("scenes", GENERATION_LIMIT));
  });

  test("the window rolls, so waiting restores the budget", () => {
    const rule = { limit: 2, windowMs: 40 };

    enforceRateLimit("rolling", rule);
    enforceRateLimit("rolling", rule);
    assert.throws(() => enforceRateLimit("rolling", rule));

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        assert.doesNotThrow(() => enforceRateLimit("rolling", rule));
        resolve();
      }, 60);
    });
  });
});
