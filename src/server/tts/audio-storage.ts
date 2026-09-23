import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Generated audio lives on disk, not in the database. Rows store the file
 * name; bytes are served by the audio route.
 *
 * The directory sits beside the SQLite file under `data/`, which is already
 * gitignored.
 */
const AUDIO_DIRECTORY = path.resolve(process.cwd(), "data", "audio");

export async function writeAudioFile(
  audio: Uint8Array,
  extension: string,
): Promise<string> {
  await mkdir(AUDIO_DIRECTORY, { recursive: true });

  const fileName = `${randomUUID()}.${extension}`;
  const target = path.join(AUDIO_DIRECTORY, fileName);

  // Write then rename so a crash mid-write cannot leave a half-file that the
  // audio route would happily serve.
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, audio);
  await rename(temporary, target);

  return fileName;
}

/** Absolute path to a stored clip, for a consumer that needs the file itself. */
export function audioFilePath(fileName: string): string {
  return resolveSafely(fileName);
}

export async function readAudioFile(fileName: string): Promise<Buffer | null> {
  try {
    return await readFile(resolveSafely(fileName));
  } catch {
    return null;
  }
}

/** Removing a file that is already gone is not an error. */
export async function deleteAudioFile(fileName: string): Promise<void> {
  try {
    await unlink(resolveSafely(fileName));
  } catch {
    // Already removed, or never written.
  }
}

/**
 * File names come from our own rows, but resolving them defensively means a
 * corrupted or hand-edited value can never escape the audio directory.
 */
function resolveSafely(fileName: string): string {
  const resolved = path.resolve(AUDIO_DIRECTORY, path.basename(fileName));

  if (!resolved.startsWith(AUDIO_DIRECTORY + path.sep)) {
    throw new Error("Refusing to read outside the audio directory.");
  }

  return resolved;
}
