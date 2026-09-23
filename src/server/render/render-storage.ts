import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Finished renders live on disk beside the audio clips, under `data/`, which
 * is already gitignored. Rows hold the file name; bytes are served by the
 * render route.
 */
const RENDER_DIRECTORY = path.resolve(process.cwd(), "data", "renders");

export async function writeRenderFile(
  bytes: Uint8Array,
  extension: string,
): Promise<string> {
  await mkdir(RENDER_DIRECTORY, { recursive: true });

  const fileName = `${randomUUID()}.${extension}`;
  const target = path.join(RENDER_DIRECTORY, fileName);

  // Write then rename, so a crash mid-write cannot leave a truncated file that
  // the render route would serve as if it were finished.
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, target);

  return fileName;
}

export async function readRenderFile(fileName: string): Promise<Buffer | null> {
  try {
    return await readFile(resolveSafely(fileName));
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

function resolveSafely(fileName: string): string {
  const resolved = path.resolve(RENDER_DIRECTORY, path.basename(fileName));

  if (!resolved.startsWith(RENDER_DIRECTORY + path.sep)) {
    throw new Error("Refusing to read outside the render directory.");
  }

  return resolved;
}
