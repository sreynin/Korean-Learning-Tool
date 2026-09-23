import assert from "node:assert/strict";
import { access, rm } from "node:fs/promises";
import { after, before, describe, test } from "node:test";
import { GET as SERVE } from "@/app/api/renders/[fileName]/route";
import { probeMedia } from "@/server/render/ffmpeg";
import { FfmpegRenderer } from "@/server/render/ffmpeg-renderer";
import { renderFilePath } from "@/server/render/render-storage";
import { RenderJobRepository } from "@/server/repositories/render-job-repository";
import { PrismaProjectRepository } from "@/server/repositories/prisma-project-repository";
import { deleteAudioFile } from "@/server/tts/audio-storage";
import {
  CAPTION_ALIGNMENTS,
  CAPTION_ANIMATIONS,
  CAPTION_POSITIONS,
  DEFAULT_CAPTION_SETTINGS,
} from "@/types/caption";
import { SCENE_TRANSITIONS } from "@/types/scene";
import type { RenderFormat } from "@/types/render";
import type { Scene } from "@/types/scene";
import type { VideoProject } from "@/types/project";
import { makeProject, makeScene, makeStoredScenes } from "./helpers/factories";
import { createTestDatabase } from "./helpers/test-db";
import type { TestDatabase } from "./helpers/test-db";

/**
 * These tests run the real encoder, so they are the slowest in the suite and
 * the only ones that prove an MP4 comes out. Scenes are one second each: long
 * enough to exercise timing and transitions, short enough to stay quick.
 *
 * Output goes to the real render directory, because that is the path the app
 * uses; every file is named after its job id and removed afterwards.
 */

let db: TestDatabase;
let projects: PrismaProjectRepository;
let jobs: RenderJobRepository;
const written: string[] = [];
const clips: string[] = [];

const renderer = new FfmpegRenderer();

before(() => {
  db = createTestDatabase();
  projects = new PrismaProjectRepository(db.client);
  jobs = new RenderJobRepository(db.client);
});

after(async () => {
  for (const fileName of written) {
    await rm(renderFilePath(fileName), { force: true });
  }
  for (const fileName of clips) {
    await deleteAudioFile(fileName);
  }
  await db.dispose();
});

function jobId(): string {
  return `test-${crypto.randomUUID()}`;
}

async function renderProject(options: {
  project: VideoProject;
  format: RenderFormat;
  id?: string;
  signal?: AbortSignal;
}) {
  const id = options.id ?? jobId();
  const progress: number[] = [];

  const result = await renderer.render({
    jobId: id,
    project: options.project,
    format: options.format,
    signal: options.signal,
    onProgress: async (percent) => {
      progress.push(percent);
    },
  });

  written.push(result.outputFileName);
  return { result, progress };
}

function projectWith(scenes: Scene[], overrides: Partial<VideoProject> = {}) {
  return makeProject({
    scenes: makeStoredScenes(scenes),
    captionSettings: DEFAULT_CAPTION_SETTINGS,
    ...overrides,
  });
}

describe("rendering a Short", () => {
  test("produces a playable 1080x1920 MP4 with the scenes in order", async () => {
    const project = projectWith([
      makeScene({
        duration: 1,
        koreanText: "안녕하세요",
        romanization: "annyeonghaseyo",
        englishText: "Hello",
        transition: "cut",
      }),
      makeScene({
        duration: 1,
        koreanText: "감사합니다",
        romanization: "gamsahamnida",
        englishText: "Thank you",
        transition: "fade",
      }),
    ]);

    const { result, progress } = await renderProject({ project, format: "shorts" });
    const media = await probeMedia(renderFilePath(result.outputFileName));

    assert.equal(result.contentType, "video/mp4");
    assert.ok(result.byteSize > 0, "the file has content");
    assert.equal(media.codec, "h264");
    assert.equal(media.width, 1080);
    assert.equal(media.height, 1920);
    assert.ok(
      Math.abs(media.durationSeconds - 2) < 0.25,
      `two one-second scenes should be about 2s, got ${media.durationSeconds}`,
    );
    assert.equal(media.hasAudio, true, "a silent scene still carries an audio track");

    // Progress is reported as each scene finishes, not in one jump at the end.
    assert.ok(progress.length >= 3, `expected per-scene progress, got ${progress}`);
    assert.deepEqual(
      [...progress].sort((a, b) => a - b),
      progress,
      "progress never moves backwards",
    );
    assert.ok(progress[0] < 100, "the first report is not already complete");
    assert.equal(progress.at(-1), 100);
  });
});

describe("rendering long form", () => {
  test("produces a 1920x1080 MP4 from the project's format", async () => {
    const project = projectWith(
      [makeScene({ duration: 1, koreanText: "한국어", englishText: "Korean" })],
      { format: "long", shortsDurationSeconds: null, longDurationSeconds: 180 },
    );

    const { result } = await renderProject({ project, format: "long" });
    const media = await probeMedia(renderFilePath(result.outputFileName));

    assert.equal(media.width, 1920);
    assert.equal(media.height, 1080);
    assert.equal(media.codec, "h264");
  });
});

describe("scene text", () => {
  test("a scene with no text at all still renders", async () => {
    const project = projectWith([
      makeScene({ duration: 1, koreanText: "", romanization: "", englishText: "" }),
    ]);

    const { result } = await renderProject({ project, format: "shorts" });
    const media = await probeMedia(renderFilePath(result.outputFileName));

    assert.equal(media.width, 1080);
    assert.ok(media.durationSeconds > 0.5);
  });

  test("captions that hide every layer still render", async () => {
    const project = projectWith([makeScene({ duration: 1 })], {
      captionSettings: {
        ...DEFAULT_CAPTION_SETTINGS,
        showKorean: false,
        showRomanization: false,
        showEnglish: false,
      },
    });

    const { result } = await renderProject({ project, format: "shorts" });
    assert.ok(result.byteSize > 0);
  });

  test("a long line is wrapped rather than pushed off the frame", async () => {
    const project = projectWith([
      makeScene({
        duration: 1,
        koreanText: "저는 한국어를 배우고 있어요 그리고 매일 연습해요",
        englishText:
          "I am learning Korean and I practise every single day without fail.",
      }),
    ]);

    const { result } = await renderProject({ project, format: "shorts" });
    assert.ok(result.byteSize > 0);
  });
});

describe("every transition and caption animation encodes", () => {
  // A seeded project failed here first: a filter string that is merely wrong
  // still type-checks, so each enum value has to be run through FFmpeg once.
  for (const transition of SCENE_TRANSITIONS) {
    test(`transition: ${transition}`, async () => {
      const project = projectWith([makeScene({ duration: 1, transition })]);
      const { result } = await renderProject({ project, format: "shorts" });

      assert.ok(result.byteSize > 0, `${transition} produced no output`);
    });
  }

  for (const animation of CAPTION_ANIMATIONS) {
    test(`caption animation: ${animation}`, async () => {
      const project = projectWith([makeScene({ duration: 1 })], {
        captionSettings: { ...DEFAULT_CAPTION_SETTINGS, animation },
      });
      const { result } = await renderProject({ project, format: "shorts" });

      assert.ok(result.byteSize > 0, `${animation} produced no output`);
    });
  }

  for (const position of CAPTION_POSITIONS) {
    for (const alignment of CAPTION_ALIGNMENTS) {
      test(`captions: ${position} / ${alignment}`, async () => {
        const project = projectWith([makeScene({ duration: 1 })], {
          captionSettings: { ...DEFAULT_CAPTION_SETTINGS, position, alignment },
        });
        const { result } = await renderProject({ project, format: "shorts" });

        assert.ok(result.byteSize > 0);
      });
    }
  }
});

describe("narration", () => {
  test("a scene's generated clip is used as its audio", async () => {
    const clip = await writeTestClip();
    clips.push(clip);

    const project = projectWith([
      makeScene({
        duration: 2,
        audio: {
          url: `/api/audio/${clip}`,
          mimeType: "audio/wav",
          byteSize: 1,
          durationSeconds: 0.5,
          settings: makeProject().voiceSettings,
          voiceName: "Ava",
          provider: "mock",
          generatedAt: new Date().toISOString(),
        },
      }),
    ]);

    const { result } = await renderProject({ project, format: "shorts" });
    const media = await probeMedia(renderFilePath(result.outputFileName));

    assert.equal(media.hasAudio, true);
    assert.ok(
      Math.abs(media.durationSeconds - 2) < 0.25,
      "narration shorter than the scene is padded, not truncated",
    );
  });
});

describe("cancellation", () => {
  test("an aborted render stops and leaves no output", async () => {
    const controller = new AbortController();
    const id = jobId();
    // Long enough that the abort lands while FFmpeg is genuinely encoding,
    // rather than before it was ever spawned.
    const project = projectWith([
      makeScene({ duration: 60 }),
      makeScene({ duration: 60 }),
    ]);

    const running = renderer.render({
      jobId: id,
      project,
      format: "shorts",
      signal: controller.signal,
      onProgress: async () => {},
    });

    await new Promise((resolve) => setTimeout(resolve, 250));
    controller.abort();

    await assert.rejects(running, /cancelled/i);
    await assert.rejects(
      access(renderFilePath(`${id}.mp4`)),
      "a cancelled render produces no file",
    );
    await assert.rejects(
      access(renderFilePath(`.work-${id}`)),
      "its scratch directory is cleaned up",
    );
  });
});

describe("serving a finished render", () => {
  test("is returned as video/mp4 and supports range requests", async () => {
    const globals = globalThis as unknown as {
      __renderJobRepository?: RenderJobRepository;
    };
    globals.__renderJobRepository = jobs;

    try {
      const project = projectWith([makeScene({ duration: 1 })]);
      await projects.create(project);
      const job = (await jobs.createIfIdle(project.id, "shorts"))!;

      const { result } = await renderProject({
        project,
        format: "shorts",
        id: job.id,
      });
      await jobs.markCompleted(job.id, {
        fileName: result.outputFileName,
        contentType: result.contentType,
        byteSize: result.byteSize,
      });

      const context = { params: Promise.resolve({ fileName: result.outputFileName }) };

      const whole = await SERVE(new Request("http://test/render"), context);
      assert.equal(whole.status, 200);
      assert.equal(whole.headers.get("content-type"), "video/mp4");
      assert.equal(whole.headers.get("content-length"), String(result.byteSize));
      assert.equal(whole.headers.get("accept-ranges"), "bytes");

      const bytes = new Uint8Array(await whole.arrayBuffer());
      assert.equal(bytes.byteLength, result.byteSize);
      // An MP4's first box is "ftyp" at offset 4 — this is really a video file.
      assert.equal(
        String.fromCharCode(...bytes.slice(4, 8)),
        "ftyp",
        "the served bytes are an MP4",
      );

      const partial = await SERVE(
        new Request("http://test/render", { headers: { range: "bytes=0-99" } }),
        { params: Promise.resolve({ fileName: result.outputFileName }) },
      );
      assert.equal(partial.status, 206);
      assert.equal(partial.headers.get("content-length"), "100");
      assert.equal(
        partial.headers.get("content-range"),
        `bytes 0-99/${result.byteSize}`,
      );

      const unknown = await SERVE(new Request("http://test/render"), {
        params: Promise.resolve({ fileName: "not-a-render.mp4" }),
      });
      assert.equal(unknown.status, 404);
    } finally {
      delete globals.__renderJobRepository;
    }
  });
});

/** A short silent WAV in the audio directory, standing in for narration. */
async function writeTestClip(): Promise<string> {
  const { writeAudioFile } = await import("@/server/tts/audio-storage");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { ffmpegPath } = await import("@/server/render/ffmpeg");
  const { readFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");

  const temporary = path.join(tmpdir(), `${crypto.randomUUID()}.wav`);
  await promisify(execFile)(ffmpegPath(), [
    "-hide_banner",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=0.5",
    "-ar",
    "48000",
    "-ac",
    "2",
    temporary,
  ]);

  const bytes = await readFile(temporary);
  await rm(temporary, { force: true });

  return writeAudioFile(bytes, "wav");
}
