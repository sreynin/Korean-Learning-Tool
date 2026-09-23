import { execFile, spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import ffmpegStatic from "ffmpeg-static";

const execFileAsync = promisify(execFile);

/**
 * Where the encoder comes from.
 *
 * A system FFmpeg wins when there is one — it is usually newer and hardware
 * aware. `ffmpeg-static` is the fallback so a fresh clone can render without
 * anyone installing anything.
 */
function resolveBinary(
  systemName: string,
  bundled: string | null,
): string | null {
  return onPath(systemName) ?? bundled;
}

function onPath(name: string): string | null {
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!directory) continue;

    const candidate = path.join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

export function ffmpegPath(): string {
  const resolved = resolveBinary("ffmpeg", ffmpegStatic);

  if (!resolved) {
    throw new Error(
      "No FFmpeg binary is available. Install FFmpeg, or reinstall dependencies so ffmpeg-static is present.",
    );
  }

  return resolved;
}

export function ffprobePath(): string {
  const resolved = resolveBinary("ffprobe", ffprobeInstaller.path);

  if (!resolved) {
    throw new Error("No ffprobe binary is available.");
  }

  return resolved;
}

/**
 * Runs one FFmpeg command to completion.
 *
 * FFmpeg writes everything to stderr, including ordinary progress, so the tail
 * is only kept to explain a failure. Aborting kills the process rather than
 * waiting for it, which is what makes a cancelled render stop promptly.
 */
export async function runFfmpeg(
  args: string[],
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  const { signal } = options;

  if (signal?.aborted) {
    throw new Error("Render cancelled.");
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath(), ["-hide_banner", "-nostdin", ...args], {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-4000);
    });

    const abort = () => child.kill("SIGKILL");
    signal?.addEventListener("abort", abort, { once: true });

    child.on("error", (error) => {
      signal?.removeEventListener("abort", abort);
      reject(error);
    });

    child.on("close", (code) => {
      signal?.removeEventListener("abort", abort);

      if (signal?.aborted) {
        reject(new Error("Render cancelled."));
      } else if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}. ${lastError(stderr)}`));
      }
    });
  });
}

/** The parts of a media file the renderer and its tests care about. */
export interface MediaInfo {
  width: number;
  height: number;
  codec: string;
  durationSeconds: number;
  hasAudio: boolean;
}

export async function probeMedia(filePath: string): Promise<MediaInfo> {
  const { stdout } = await execFileAsync(ffprobePath(), [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_name,codec_type,width,height:format=duration",
    "-of",
    "json",
    filePath,
  ]);

  const parsed = JSON.parse(stdout) as {
    streams?: {
      codec_name?: string;
      codec_type?: string;
      width?: number;
      height?: number;
    }[];
    format?: { duration?: string };
  };

  const video = parsed.streams?.find((stream) => stream.codec_type === "video");

  return {
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    codec: video?.codec_name ?? "",
    durationSeconds: Number(parsed.format?.duration ?? 0),
    hasAudio: Boolean(
      parsed.streams?.some((stream) => stream.codec_type === "audio"),
    ),
  };
}

/**
 * The line that explains the failure.
 *
 * FFmpeg's last line is usually just "Conversion failed!"; the cause is the
 * first line that actually names a problem, which is what a failed job should
 * record.
 */
function lastError(stderr: string): string {
  const lines = stderr
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const cause = lines.find((line) =>
    /error|invalid|no such|unable|failed to|unrecognized/i.test(line),
  );

  return cause ?? lines[lines.length - 1] ?? "No output from FFmpeg.";
}
