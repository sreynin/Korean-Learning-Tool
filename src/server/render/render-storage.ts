import { mkdir, rm, stat, unlink } from "node:fs/promises";
import path from "node:path";

/**
 * Finished renders live on disk beside the audio clips, under `data/`, which
 * is already gitignored. Rows hold the file name; bytes are served by the
 * render route.
 */
const RENDER_DIRECTORY = path.resolve(process.cwd(), "data", "renders");

export interface RenderWorkspace {
  /** Scratch directory for segments and text files. Removed by `dispose`. */
  directory: string;
  /** Name the finished file takes inside the render directory. */
  outputFileName: string;
  dispose: () => Promise<void>;
}

/**
 * Scratch space for one job, plus the name its output will take.
 *
 * The output is named after the job, so a file on disk can always be traced
 * back to the render that produced it, and no two jobs can collide. The
 * workspace sits in its own directory that is deleted whatever the outcome —
 * a failed or cancelled render leaves nothing behind, while a finished MP4 is
 * outside it and survives.
 */
export async function createRenderWorkspace(
  jobId: string,
): Promise<RenderWorkspace> {
  await mkdir(RENDER_DIRECTORY, { recursive: true });

  const directory = path.join(RENDER_DIRECTORY, `.work-${jobId}`);
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });

  return {
    directory,
    outputFileName: `${jobId}.mp4`,
    dispose: () => rm(directory, { recursive: true, force: true }),
  };
}

/** Absolute path of a finished render, for writing, streaming, or probing. */
export function renderFilePath(fileName: string): string {
  return resolveSafely(fileName);
}

export async function renderFileSize(fileName: string): Promise<number | null> {
  try {
    const { size } = await stat(resolveSafely(fileName));
    return size;
  } catch {
    return null;
  }
}

/** Removing a file that is already gone is not an error. */
export async function deleteRenderFile(fileName: string): Promise<void> {
  try {
    await unlink(resolveSafely(fileName));
  } catch {
    // Already removed, or never written.
  }
}

/**
 * File names come from our own rows, but resolving them defensively means a
 * corrupted or hand-edited value can never escape the render directory.
 */
function resolveSafely(fileName: string): string {
  const resolved = path.resolve(RENDER_DIRECTORY, path.basename(fileName));

  if (!resolved.startsWith(RENDER_DIRECTORY + path.sep)) {
    throw new Error("Refusing to read outside the render directory.");
  }

  return resolved;
}
