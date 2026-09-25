import { access, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getServerEnv } from "@/lib/env";
import { runFfmpeg } from "@/server/render/ffmpeg";
import {
  backgroundColors,
  frameSize,
  layoutScene,
  sidePadding,
} from "@/server/render/frame-layout";
import {
  createRenderWorkspace,
  renderFilePath,
} from "@/server/render/render-storage";
import { audioFilePath } from "@/server/tts/audio-storage";
import { DEFAULT_CAPTION_SETTINGS } from "@/types/caption";
import type { CaptionSettings } from "@/types/caption";
import type { RenderFormat } from "@/types/render";
import type { Scene } from "@/types/scene";
import type { LaidOutText } from "@/server/render/frame-layout";
import type { RenderRequest, RenderResult, Renderer } from "@/server/render/renderer";
import { createLogger } from "@/server/logger";

const log = createLogger("render");

export const FFMPEG_RENDERER_NAME = "ffmpeg";
export const RENDER_CONTENT_TYPE = "video/mp4";

const FRAME_RATE = 30;
const AUDIO_SAMPLE_RATE = 48000;

/** How long an entry effect runs, matching the preview's transitions. */
const TRANSITION_SECONDS = 0.4;
/** Share of the total that encoding scenes accounts for; joining is the rest. */
const SCENE_SHARE = 0.9;

/**
 * Korean-capable faces, in the order they are tried. FFmpeg's drawtext needs a
 * file, not a family name, so there is no fontconfig lookup to fall back on.
 */
const FONT_CANDIDATES = [
  "/System/Library/Fonts/AppleSDGothicNeo.ttc",
  "/System/Library/Fonts/Supplemental/AppleGothic.ttf",
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
  "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc",
  "C:\\Windows\\Fonts\\malgun.ttf",
];

/**
 * Encodes a project into an MP4.
 *
 * Each scene becomes its own segment, and the segments are concatenated without
 * re-encoding. That shape is deliberate:
 *
 * - scene durations stay exact, because nothing overlaps two scenes;
 * - progress is real, reported as each scene finishes rather than on a timer;
 * - a scene's background is one input, so swapping the placeholder gradient for
 *   a generated image later changes one function, not the pipeline.
 *
 * Scenes have no imagery yet — `visualPrompt` is a prompt, not an asset — so
 * the backdrop is the same deterministic gradient the preview draws.
 */
export class FfmpegRenderer implements Renderer {
  readonly name = FFMPEG_RENDERER_NAME;

  async render(request: RenderRequest): Promise<RenderResult> {
    const { project, jobId, format, onProgress, signal } = request;
    const scenes = project.scenes?.scenes ?? [];

    if (scenes.length === 0) {
      throw new Error("This project has no scenes to render.");
    }

    const captions = project.captionSettings ?? DEFAULT_CAPTION_SETTINGS;
    const fontFile = await resolveFont();
    const workspace = await createRenderWorkspace(jobId);

    try {
      const totalDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0);
      const segments: string[] = [];
      let renderedDuration = 0;

      for (const [index, scene] of scenes.entries()) {
        const segment = path.join(workspace.directory, `scene-${index}.mp4`);

        await this.renderScene({
          scene,
          captions,
          format,
          fontFile,
          workspace: workspace.directory,
          index,
          output: segment,
          signal,
        });

        segments.push(segment);
        renderedDuration += scene.duration;
        await onProgress((renderedDuration / totalDuration) * 100 * SCENE_SHARE);
      }

      const output = renderFilePath(workspace.outputFileName);
      await concatenate(segments, workspace.directory, output, signal);

      const posterFileName = await extractPoster(
        output,
        workspace.posterFileName,
        posterOffset(scenes),
        signal,
      );

      const { size } = await stat(output);
      await onProgress(100);

      return {
        outputFileName: workspace.outputFileName,
        posterFileName,
        contentType: RENDER_CONTENT_TYPE,
        byteSize: size,
      };
    } finally {
      // Segments and text files are scratch; the finished MP4 lives outside the
      // workspace, so cleanup cannot remove it — including when a render fails
      // or is cancelled part way through.
      await workspace.dispose();
    }
  }

  private async renderScene(options: {
    scene: Scene;
    captions: CaptionSettings;
    format: RenderFormat;
    fontFile: string;
    workspace: string;
    index: number;
    output: string;
    signal?: AbortSignal;
  }): Promise<void> {
    const { scene, captions, format, fontFile, workspace, index, output, signal } =
      options;

    const { width, height } = frameSize(format);
    const colors = backgroundColors(scene.background || scene.id);
    const narration = await narrationInput(scene);

    const args = [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `gradients=s=${width}x${height}:c0=${colors.from}:c1=${colors.to}` +
        `:x0=0:y0=0:x1=${width}:y1=${height}:type=linear:speed=0.00001`,
    ];

    if (narration) {
      args.push("-i", narration);
    } else {
      args.push(
        "-f",
        "lavfi",
        "-i",
        `anullsrc=r=${AUDIO_SAMPLE_RATE}:cl=stereo`,
      );
    }

    const layers = layoutScene(scene, captions, format);
    const filters: string[] = [];

    for (const [layerIndex, layer] of layers.entries()) {
      for (const [lineIndex, line] of layer.lines.entries()) {
        const textFile = path.join(
          workspace,
          `scene-${index}-${layer.layer}-${lineIndex}.txt`,
        );
        await writeFile(textFile, line, "utf8");

        filters.push(
          drawText({
            layer,
            lineIndex,
            textFile,
            fontFile,
            captions,
            format,
            layerIndex,
          }),
        );
      }
    }

    filters.push(...entryEffect(scene.transition, { width, height }));
    // yuv420p and an even frame size are what makes the result playable
    // everywhere rather than only in FFmpeg's own player.
    filters.push("format=yuv420p");

    args.push(
      "-vf",
      filters.join(","),
      "-t",
      scene.duration.toFixed(3),
      "-r",
      String(FRAME_RATE),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ar",
      String(AUDIO_SAMPLE_RATE),
      "-ac",
      "2",
      // Narration shorter than the scene is padded with silence, so every
      // segment's audio is exactly as long as its video and the join is clean.
      "-af",
      "apad",
      "-shortest",
      "-movflags",
      "+faststart",
      output,
    );

    await runFfmpeg(args, { signal });
  }
}

/**
 * Picks the moment the thumbnail is taken from.
 *
 * A hook scene often carries no on-screen text, so the opening second of the
 * video is a bare gradient — a whole library of those is unreadable. This
 * lands one second into the first scene that actually draws something, which
 * is still a real frame of the finished video and not a composed image. If no
 * scene has text, the opening second is as good as any.
 */
export function posterOffset(scenes: Scene[]): number {
  let elapsed = 0;

  for (const scene of scenes) {
    const hasText = Boolean(
      scene.koreanText || scene.englishText || scene.romanization,
    );
    // Only worth jumping to if the scene is long enough to still be on screen.
    if (hasText && scene.duration >= 2) return elapsed + 1;
    elapsed += scene.duration;
  }

  return 1;
}

/**
 * Grabs a still for the library thumbnail.
 *
 * Taken a second into its scene, so it lands after any fade-in rather than on
 * an empty frame. A render is still a success if this fails — a missing
 * thumbnail is a cosmetic loss, and the card falls back to the gradient.
 */
async function extractPoster(
  videoPath: string,
  posterFileName: string,
  offsetSeconds: number,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    await runFfmpeg(
      [
        "-y",
        "-ss",
        String(offsetSeconds),
        "-i",
        videoPath,
        "-frames:v",
        "1",
        "-vf",
        "scale=640:-2",
        "-q:v",
        "4",
        renderFilePath(posterFileName),
      ],
      { signal },
    );

    return posterFileName;
  } catch (error) {
    if (signal?.aborted) throw error;

    log.error("could not extract a poster frame", error);
    return null;
  }
}

/**
 * Joins the segments without re-encoding. Every segment was produced with the
 * same codecs and parameters, which is what makes a stream copy safe — and
 * keeps the join close to instant no matter how long the video is.
 */
async function concatenate(
  segments: string[],
  workspace: string,
  output: string,
  signal?: AbortSignal,
): Promise<void> {
  const listFile = path.join(workspace, "segments.txt");
  await writeFile(
    listFile,
    segments.map((segment) => `file '${segment.replace(/'/g, "'\\''")}'`).join("\n"),
    "utf8",
  );

  await runFfmpeg(
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listFile,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      output,
    ],
    { signal },
  );
}

/**
 * One drawtext filter for one line.
 *
 * Text is passed by file rather than inline: a lesson can contain quotes,
 * colons, and percent signs, all of which are filtergraph syntax.
 */
function drawText(options: {
  layer: LaidOutText;
  lineIndex: number;
  textFile: string;
  fontFile: string;
  captions: CaptionSettings;
  format: RenderFormat;
  layerIndex: number;
}): string {
  const { layer, lineIndex, textFile, fontFile, captions, format, layerIndex } =
    options;

  const padding = sidePadding(format);
  const x =
    captions.alignment === "left"
      ? String(padding)
      : captions.alignment === "right"
        ? `w-text_w-${padding}`
        : "(w-text_w)/2";

  const parts = [
    "drawtext=",
    `fontfile=${escapeFilterValue(fontFile)}`,
    `:textfile=${escapeFilterValue(textFile)}`,
    `:fontsize=${layer.fontSize}`,
    `:fontcolor=white@${layer.opacity}`,
    // Quoted because an expression may contain a comma, which would otherwise
    // read as the end of this filter.
    `:x='${x}'`,
    `:y='${entryY(layer, captions, layerIndex, lineIndex)}'`,
    // The preview gives the text a drop shadow; without one, light text over a
    // light backdrop would be unreadable.
    ":shadowcolor=black@0.55",
    `:shadowx=${Math.max(2, Math.round(layer.fontSize * 0.04))}`,
    `:shadowy=${Math.max(2, Math.round(layer.fontSize * 0.04))}`,
  ];

  const alpha = entryAlpha(captions.animation, layer.opacity, layerIndex);
  if (alpha) parts.push(`:alpha='${alpha}'`);

  return parts.join("");
}

/** Caption animations, expressed against FFmpeg's frame time `t`. */
function entryAlpha(
  animation: CaptionSettings["animation"],
  opacity: number,
  layerIndex: number,
): string | null {
  if (animation === "none") return null;

  const delay = layerIndex * 0.08;
  const ramp = animation === "pop" ? 0.18 : TRANSITION_SECONDS;

  return `min(${opacity},max(0,(t-${delay.toFixed(2)})/${ramp}))`;
}

function entryY(
  layer: LaidOutText,
  captions: CaptionSettings,
  layerIndex: number,
  lineIndex: number,
): string {
  const top = layer.y + lineIndex * layer.lineHeight;

  if (captions.animation !== "slide_up") return String(top);

  const delay = layerIndex * 0.08;
  const travel = Math.round(layer.fontSize * 0.8);

  return `${top}+${travel}*max(0,1-(t-${delay.toFixed(2)})/${TRANSITION_SECONDS})`;
}

/**
 * A scene's own entry transition, applied to the finished frame.
 *
 * `cut` is the absence of one. `fade` and `dissolve` come up from black and
 * `zoom` settles out of a push, all as the preview does. `slide` is a fade
 * here: sliding a frame in would expose whatever is behind it, and with no
 * real imagery yet that is black — worse than a clean fade. It becomes a true
 * directional wipe when scenes have backgrounds to slide.
 */
function entryEffect(
  transition: Scene["transition"],
  frame: { width: number; height: number },
): string[] {
  const fadeIn = (seconds: number) => `fade=t=in:st=0:d=${seconds.toFixed(2)}`;

  switch (transition) {
    case "cut":
      return [];
    case "fade":
    case "slide":
      return [fadeIn(TRANSITION_SECONDS)];
    case "dissolve":
      return [fadeIn(TRANSITION_SECONDS * 1.5)];
    case "zoom": {
      const frames = Math.round(TRANSITION_SECONDS * 1.5 * FRAME_RATE);
      return [
        `zoompan=z='max(1,1.08-0.08*on/${frames})':d=1` +
          `:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'` +
          `:s=${frame.width}x${frame.height}:fps=${FRAME_RATE}`,
        fadeIn(TRANSITION_SECONDS),
      ];
    }
  }
}

/** The narration file for a scene, when one has been generated. */
async function narrationInput(scene: Scene): Promise<string | null> {
  if (!scene.audio) return null;

  const filePath = audioFilePath(path.basename(scene.audio.url));

  try {
    await access(filePath);
    return filePath;
  } catch {
    // The row points at a clip that is no longer on disk. A silent scene is a
    // better outcome than a failed render.
    return null;
  }
}

async function resolveFont(): Promise<string> {
  const configured = getServerEnv().RENDER_FONT_PATH;

  for (const candidate of configured ? [configured] : FONT_CANDIDATES) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(
    "No Korean-capable font was found. Install one (for example Noto Sans CJK) or set RENDER_FONT_PATH to a font file.",
  );
}

/** `:` and `\` separate options inside a filtergraph, so a path must escape them. */
function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}
