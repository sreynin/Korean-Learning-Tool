import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { GET as READ } from "@/app/api/projects/[id]/renders/[jobId]/route";
import { GET as LIST, POST } from "@/app/api/projects/[id]/renders/route";
import { PrismaProjectRepository } from "@/server/repositories/prisma-project-repository";
import { RenderJobRepository } from "@/server/repositories/render-job-repository";
import { InProcessRenderQueue } from "@/server/render/render-queue";
import type { ProjectRepository } from "@/server/repositories";
import type { RenderQueue } from "@/server/render";
import type { RenderRequest, RenderResult, Renderer } from "@/server/render/renderer";
import type { RenderJob } from "@/types/render";
import type { VideoProject } from "@/types/project";
import { makeLesson, makeProject, makeScene, makeStoredScenes } from "./helpers/factories";
import { createTestDatabase } from "./helpers/test-db";
import type { TestDatabase } from "./helpers/test-db";

/**
 * The route handlers resolve their dependencies through the same `globalThis`
 * getters the app uses, so pointing those at the test database is all it takes
 * to exercise the real HTTP boundary — no server, no mocking of the handler.
 */
const globals = globalThis as unknown as {
  __projectRepository?: ProjectRepository;
  __renderJobRepository?: RenderJobRepository;
  __renderQueue?: RenderQueue;
};

let db: TestDatabase;
let projects: PrismaProjectRepository;
let jobs: RenderJobRepository;
let renderer: BlockingRenderer;
let settled: Promise<void>;

/** Starts, reports progress, then waits to be released by the test. */
class BlockingRenderer implements Renderer {
  readonly name = "test-blocking";
  started = false;

  private release!: () => void;
  private readonly gate = new Promise<void>((resolve) => {
    this.release = resolve;
  });

  async render(request: RenderRequest): Promise<RenderResult> {
    this.started = true;
    await request.onProgress(25);
    await this.gate;
    await request.onProgress(100);
    return {
      outputFileName: `${request.jobId}.mp4`,
      posterFileName: null,
      contentType: "video/mp4",
      byteSize: 1024,
    };
  }

  finish(): void {
    this.release();
  }
}

before(() => {
  db = createTestDatabase();
  projects = new PrismaProjectRepository(db.client);
  jobs = new RenderJobRepository(db.client);

  globals.__projectRepository = projects;
  globals.__renderJobRepository = jobs;
});

beforeEach(() => {
  renderer = new BlockingRenderer();
  settled = new Promise<void>((resolve) => {
    globals.__renderQueue = new InProcessRenderQueue({
      renderer,
      jobs,
      projects,
      onSettled: resolve,
    });
  });
});

after(async () => {
  delete globals.__projectRepository;
  delete globals.__renderJobRepository;
  delete globals.__renderQueue;
  await db.dispose();
});

function context<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

async function seedRenderableProject(): Promise<string> {
  const project = makeProject();
  await projects.create(project);
  await projects.update(project.id, {
    lesson: makeLesson(),
    scenes: makeStoredScenes([makeScene(), makeScene({ koreanText: "둘" })]),
  });
  return project.id;
}

describe("POST /api/projects/[id]/renders", () => {
  test("returns a job instead of waiting for the render", async () => {
    const id = await seedRenderableProject();

    const response = await POST(new Request("http://test/renders", { method: "POST" }), context({ id }));
    const body = (await response.json()) as {
      ok: true;
      data: { job: RenderJob; project: VideoProject };
    };

    assert.equal(response.status, 201);
    assert.equal(body.ok, true);

    // The render is still inside the (blocked) renderer at this point, so the
    // request demonstrably did not perform it.
    assert.notEqual(body.data.job.status, "completed");
    assert.equal(body.data.job.outputUrl, null);
    assert.equal(
      body.data.project.pipeline.render.status,
      "in_progress",
      "an active job moves the stage, without completing it",
    );

    renderer.finish();
    await settled;

    const finished = await jobs.findById(body.data.job.id);
    assert.equal(finished?.status, "completed");
    assert.ok(finished?.outputUrl, "the finished job carries its output");
  });

  test("refuses a second render while one is in flight", async () => {
    const id = await seedRenderableProject();

    await POST(new Request("http://test/renders", { method: "POST" }), context({ id }));
    const duplicate = await POST(
      new Request("http://test/renders", { method: "POST" }),
      context({ id }),
    );
    const body = (await duplicate.json()) as { ok: false; error: { code: string } };

    assert.equal(duplicate.status, 409);
    assert.equal(body.error.code, "conflict");
    assert.equal(
      (await jobs.listForProject(id)).length,
      1,
      "the repeated click created no second job",
    );

    renderer.finish();
    await settled;
  });

  test("refuses a project that has no storyboard", async () => {
    const project = makeProject();
    await projects.create(project);

    const response = await POST(
      new Request("http://test/renders", { method: "POST" }),
      context({ id: project.id }),
    );
    const body = (await response.json()) as { ok: false; error: { code: string } };

    assert.equal(response.status, 409);
    assert.equal(body.error.code, "conflict");
    assert.equal(renderer.started, false, "nothing was handed to the renderer");
    assert.equal((await jobs.listForProject(project.id)).length, 0);
  });

  test("404s for a project that does not exist", async () => {
    const response = await POST(
      new Request("http://test/renders", { method: "POST" }),
      context({ id: "missing" }),
    );
    const body = (await response.json()) as { ok: false; error: { code: string } };

    assert.equal(response.status, 404);
    assert.equal(body.error.code, "not_found");
  });
});

describe("reading render jobs", () => {
  test("a client can poll one job and list them all", async () => {
    const id = await seedRenderableProject();
    const created = (await POST(
      new Request("http://test/renders", { method: "POST" }),
      context({ id }),
    ).then((response) => response.json())) as { data: { job: RenderJob } };

    const polled = await READ(
      new Request("http://test/renders"),
      context({ id, jobId: created.data.job.id }),
    );
    const polledBody = (await polled.json()) as { data: RenderJob };

    assert.equal(polled.status, 200);
    assert.equal(polledBody.data.id, created.data.job.id);
    assert.ok(polledBody.data.progress >= 0);

    const listed = await LIST(new Request("http://test/renders"), context({ id }));
    const listedBody = (await listed.json()) as { data: RenderJob[] };

    assert.equal(listed.status, 200);
    assert.equal(listedBody.data.length, 1);

    renderer.finish();
    await settled;
  });

  test("404s for a job that belongs to another project", async () => {
    const id = await seedRenderableProject();
    const other = await seedRenderableProject();
    const created = (await POST(
      new Request("http://test/renders", { method: "POST" }),
      context({ id }),
    ).then((response) => response.json())) as { data: { job: RenderJob } };

    const response = await READ(
      new Request("http://test/renders"),
      context({ id: other, jobId: created.data.job.id }),
    );

    assert.equal(response.status, 404);

    renderer.finish();
    await settled;
  });
});
