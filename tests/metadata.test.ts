import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { POST as REGENERATE } from "@/app/api/projects/[id]/metadata/[field]/route";
import { POST as GENERATE, PUT as SAVE } from "@/app/api/projects/[id]/metadata/route";
import { clampMetadata, metadataEditSchema } from "@/server/ai/metadata-schema";
import { MockMetadataGenerator } from "@/server/ai/mock-metadata-generator";
import { PrismaProjectRepository } from "@/server/repositories/prisma-project-repository";
import { reconcilePipeline } from "@/server/services/pipeline-service";
import { MAX_HASHTAGS, METADATA_LIMITS, metadataFor, tagsLength } from "@/types/metadata";
import type { ProjectRepository } from "@/server/repositories";
import type { StoredMetadata, VideoMetadata } from "@/types/metadata";
import type { VideoProject } from "@/types/project";
import { makeLesson, makeProject } from "./helpers/factories";
import { jsonRequest } from "./helpers/http";
import { createTestDatabase } from "./helpers/test-db";
import type { TestDatabase } from "./helpers/test-db";

const globals = globalThis as unknown as {
  __projectRepository?: ProjectRepository;
};

let db: TestDatabase;
let projects: PrismaProjectRepository;

before(() => {
  db = createTestDatabase();
  projects = new PrismaProjectRepository(db.client);
  globals.__projectRepository = projects;
});

after(async () => {
  delete globals.__projectRepository;
  await db.dispose();
});

beforeEach(() => {
  // No AI_API_KEY in tests, so the composition point hands out the mock
  // generator. Clearing it keeps each test independent of the last.
  delete (globalThis as { __metadataGenerator?: unknown }).__metadataGenerator;
});

function context<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

function post(body?: unknown) {
  return jsonRequest("http://test/metadata", "POST", body);
}

async function seedProject(
  overrides: Partial<VideoProject> = {},
): Promise<VideoProject> {
  const project = makeProject(overrides);
  await projects.create(project);
  await projects.update(project.id, { lesson: makeLesson() });
  return (await projects.findById(project.id))!;
}

async function generate(id: string, format?: string) {
  const response = await GENERATE(post(format ? { format } : undefined), context({ id }));
  const body = (await response.json()) as
    | { ok: true; data: VideoProject }
    | { ok: false; error: { code: string; message: string } };

  return { status: response.status, body };
}

function contentOf(project: VideoProject, format: "shorts" | "long"): VideoMetadata {
  const stored = metadataFor(project.metadata, format);
  assert.ok(stored, `expected metadata for ${format}`);
  return stored.content;
}

describe("generating metadata", () => {
  test("writes every field and stores it against the cut", async () => {
    const project = await seedProject();

    const { status, body } = await generate(project.id);
    assert.equal(status, 200);
    assert.ok(body.ok);

    const stored = metadataFor(body.data.metadata, "shorts");
    assert.ok(stored);
    assert.equal(stored.format, "shorts");
    assert.equal(stored.model, "mock");
    assert.equal(stored.editedAt, null);

    for (const [field, value] of Object.entries(stored.content)) {
      assert.ok(
        Array.isArray(value) ? value.length > 0 : value.length > 0,
        `${field} is empty`,
      );
    }
  });

  test("survives a round trip through the database", async () => {
    const project = await seedProject();
    await generate(project.id);

    const reloaded = await projects.findById(project.id);
    const stored = metadataFor(reloaded!.metadata, "shorts");

    assert.ok(stored);
    assert.ok(Array.isArray(stored.content.hashtags));
    assert.ok(Array.isArray(stored.content.tags));
    assert.ok(stored.content.title.length > 0);
  });

  test("a Short's title differs from the long-form title", async () => {
    const project = await seedProject({
      format: "both",
      shortsDurationSeconds: 30,
      longDurationSeconds: 300,
    });

    await generate(project.id, "shorts");
    const { body } = await generate(project.id, "long");
    assert.ok(body.ok);

    const shorts = contentOf(body.data, "shorts");
    const long = contentOf(body.data, "long");

    assert.notEqual(shorts.title, long.title);
    assert.match(shorts.title, /#Shorts/);
    assert.doesNotMatch(long.title, /#Shorts/);
  });

  test("409s when the project has no lesson", async () => {
    const project = makeProject();
    await projects.create(project);

    const { status, body } = await generate(project.id);
    assert.equal(status, 409);
    assert.ok(!body.ok);
    assert.equal(body.error.code, "conflict");
  });

  test("400s for a cut the project does not produce", async () => {
    const project = await seedProject({ format: "shorts" });

    const { status, body } = await generate(project.id, "long");
    assert.equal(status, 400);
    assert.ok(!body.ok);
    assert.equal(body.error.code, "validation_error");
  });
});

describe("regenerating one field", () => {
  test("replaces that field and leaves the others untouched", async () => {
    const project = await seedProject();
    const { body: first } = await generate(project.id);
    assert.ok(first.ok);
    const before = contentOf(first.data, "shorts");

    const response = await REGENERATE(post(), context({ id: project.id, field: "title" }));
    const body = (await response.json()) as { ok: true; data: VideoProject };
    const after = contentOf(body.data, "shorts");

    assert.equal(response.status, 200);
    assert.notEqual(after.title, before.title);
    assert.equal(after.description, before.description);
    assert.deepEqual(after.hashtags, before.hashtags);
    assert.deepEqual(after.tags, before.tags);
    assert.equal(after.thumbnailText, before.thumbnailText);
    assert.equal(after.pinnedComment, before.pinnedComment);
  });

  test("keeps the document's original generation time", async () => {
    const project = await seedProject();
    const { body: first } = await generate(project.id);
    assert.ok(first.ok);
    const before = metadataFor(first.data.metadata, "shorts")!;

    const response = await REGENERATE(
      post(),
      context({ id: project.id, field: "pinnedComment" }),
    );
    const body = (await response.json()) as { ok: true; data: VideoProject };
    const after = metadataFor(body.data.metadata, "shorts")!;

    assert.equal(after.generatedAt, before.generatedAt);
  });

  test("409s before anything has been generated", async () => {
    const project = await seedProject();

    const response = await REGENERATE(post(), context({ id: project.id, field: "title" }));
    const body = (await response.json()) as { ok: false; error: { code: string } };

    assert.equal(response.status, 409);
    assert.equal(body.error.code, "conflict");
  });

  test("400s for a field that does not exist", async () => {
    const project = await seedProject();
    await generate(project.id);

    const response = await REGENERATE(
      post(),
      context({ id: project.id, field: "subtitle" }),
    );
    const body = (await response.json()) as { ok: false; error: { code: string } };

    assert.equal(response.status, 400);
    assert.equal(body.error.code, "validation_error");
  });
});

describe("editing", () => {
  test("a saved edit is kept and marked as edited", async () => {
    const project = await seedProject();
    const { body: first } = await generate(project.id);
    assert.ok(first.ok);
    const original = metadataFor(first.data.metadata, "shorts")!;

    const edited: VideoMetadata = {
      ...original.content,
      title: "My own title 🇰🇷 #Shorts",
      hashtags: ["#Korean"],
    };

    const response = await SAVE(
      jsonRequest("http://test/metadata", "PUT", { ...edited, format: "shorts" }),
      context({ id: project.id }),
    );
    const body = (await response.json()) as { ok: true; data: VideoProject };
    const stored = metadataFor(body.data.metadata, "shorts")!;

    assert.equal(response.status, 200);
    assert.equal(stored.content.title, "My own title 🇰🇷 #Shorts");
    assert.deepEqual(stored.content.hashtags, ["#Korean"]);
    assert.ok(stored.editedAt, "an edit is recorded");
    assert.equal(
      stored.generatedAt,
      original.generatedAt,
      "editing does not rewrite when it was generated",
    );
    assert.equal(stored.model, original.model, "the original model is preserved");
  });

  test("rejects a title past YouTube's limit, with a field-level issue", async () => {
    const project = await seedProject();
    const { body: first } = await generate(project.id);
    assert.ok(first.ok);

    const response = await SAVE(
      jsonRequest("http://test/metadata", "PUT", {
        ...contentOf(first.data, "shorts"),
        title: "x".repeat(METADATA_LIMITS.title + 1),
      }),
      context({ id: project.id }),
    );
    const body = (await response.json()) as {
      ok: false;
      error: { code: string; issues?: { field: string }[] };
    };

    assert.equal(response.status, 400);
    assert.equal(body.error.code, "validation_error");
    assert.ok(body.error.issues?.some((issue) => issue.field === "title"));
  });

  test("rejects a hashtag containing a space", () => {
    const result = metadataEditSchema.safeParse({
      title: "A title",
      description: "",
      hashtags: ["#not valid"],
      tags: [],
      thumbnailText: "",
      pinnedComment: "",
    });

    assert.equal(result.success, false);
  });
});

describe("clamping a generation", () => {
  test("cuts long values and drops unusable entries instead of failing", () => {
    const clamped = clampMetadata({
      title: "t".repeat(200),
      description: "d".repeat(6000),
      hashtags: ["korean", "#learn korean", "#Hangul", ...Array(10).fill("#extra")],
      tags: ["#hashy", " spaced ", ...Array(30).fill("filler tag")],
      thumbnailText: "x".repeat(100),
      pinnedComment: "p".repeat(900),
    });

    assert.equal(clamped.title.length, METADATA_LIMITS.title);
    assert.equal(clamped.description.length, METADATA_LIMITS.description);
    assert.equal(clamped.thumbnailText.length, METADATA_LIMITS.thumbnailText);
    assert.equal(clamped.pinnedComment.length, METADATA_LIMITS.pinnedComment);

    assert.ok(clamped.hashtags.length <= MAX_HASHTAGS);
    assert.ok(
      clamped.hashtags.every((value) => value.startsWith("#") && !value.includes(" ")),
      `bad hashtag in ${JSON.stringify(clamped.hashtags)}`,
    );
    assert.ok(clamped.hashtags.includes("#korean"), "a missing # is added, not dropped");

    assert.ok(tagsLength(clamped.tags) <= METADATA_LIMITS.tagsTotal);
    assert.ok(clamped.tags.every((value) => !value.startsWith("#")));

    // Everything it produced must satisfy the strict schema a human save uses.
    assert.equal(metadataEditSchema.safeParse(clamped).success, true);
  });
});

describe("the youtube stage", () => {
  test("is pending with no metadata", async () => {
    const project = await seedProject();
    assert.equal(reconcilePipeline(project).youtube.status, "pending");
  });

  test("completes when the project's only cut has metadata", async () => {
    const project = await seedProject({ format: "shorts" });
    const { body } = await generate(project.id);
    assert.ok(body.ok);

    assert.equal(reconcilePipeline(body.data).youtube.status, "complete");
    assert.equal(
      (await projects.findById(project.id))!.pipeline.youtube.status,
      "complete",
      "the derived status is persisted",
    );
  });

  test("a both project is in progress until each cut is written", async () => {
    const project = await seedProject({
      format: "both",
      shortsDurationSeconds: 30,
      longDurationSeconds: 300,
    });

    const { body: afterShorts } = await generate(project.id, "shorts");
    assert.ok(afterShorts.ok);
    assert.equal(reconcilePipeline(afterShorts.data).youtube.status, "in_progress");

    const { body: afterLong } = await generate(project.id, "long");
    assert.ok(afterLong.ok);
    assert.equal(reconcilePipeline(afterLong.data).youtube.status, "complete");
  });

  test("reverts when the metadata is removed", async () => {
    const project = await seedProject();
    await generate(project.id);

    await db.client.metadata.deleteMany({ where: { projectId: project.id } });
    const reloaded = await projects.findById(project.id);

    assert.equal(reconcilePipeline(reloaded!).youtube.status, "pending");
  });
});

describe("metadata does not disturb the rest of the project", () => {
  test("the lesson, storyboard, and render state survive a save", async () => {
    const project = await seedProject();
    const { body } = await generate(project.id);
    assert.ok(body.ok);

    const reloaded = await projects.findById(project.id);
    assert.ok(reloaded?.lesson, "the lesson survives");
    assert.equal(reloaded?.title, project.title);
    assert.equal(reloaded?.hasRenderOutput, false);
    assert.equal(
      reloaded?.status,
      "lesson_ready",
      "status follows the content, and the content is a lesson",
    );
  });

  test("writing one cut leaves the other cut's document alone", async () => {
    const project = await seedProject({
      format: "both",
      shortsDurationSeconds: 30,
      longDurationSeconds: 300,
    });

    await generate(project.id, "shorts");
    const beforeLong = metadataFor(
      (await projects.findById(project.id))!.metadata,
      "shorts",
    ) as StoredMetadata;

    await generate(project.id, "long");
    const afterLong = metadataFor(
      (await projects.findById(project.id))!.metadata,
      "shorts",
    ) as StoredMetadata;

    assert.deepEqual(afterLong, beforeLong);
  });
});

describe("the mock generator", () => {
  test("names itself as mock in the fields a creator reads", async () => {
    const project = await seedProject();
    const generator = new MockMetadataGenerator();

    const { content } = await generator.generate({
      lesson: makeLesson().content,
      format: "shorts",
      level: project.level,
      language: "English",
      durationSeconds: 30,
    });

    assert.match(content.title, /sample/i);
    assert.match(content.description, /mock|sample/i);
    assert.match(content.thumbnailText, /sample/i);
    assert.match(content.pinnedComment, /sample/i);
    assert.ok(content.hashtags.some((tag) => /sample/i.test(tag)));
  });
});
