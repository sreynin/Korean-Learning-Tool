import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { NotFoundError } from "@/server/errors";
import { route } from "@/server/http";
import { sceneAudioRepository } from "@/server/repositories/scene-audio-repository";
import { audioFilePath } from "@/server/tts/audio-storage";

interface RouteContext {
  params: Promise<{ fileName: string }>;
}

/**
 * Serves a generated clip. The name is looked up in the database first, so
 * only files this app actually wrote can be read.
 */
export const GET = route(async (_request: Request, context: RouteContext) => {
  const { fileName } = await context.params;

  const record = await sceneAudioRepository.findByFileName(fileName);
  if (!record) {
    throw new NotFoundError("No audio found with that name.");
  }

  const filePath = audioFilePath(record.fileName);

  let byteSize: number;
  try {
    ({ size: byteSize } = await stat(filePath));
  } catch {
    throw new NotFoundError("The audio file is missing from disk.");
  }

  // Streamed rather than buffered. Clips are short, but reading every one
  // fully into memory to hand it to the response is a habit that stops being
  // harmless the moment something longer is served by the same route — and
  // the finished-render route next door already streams.
  return new NextResponse(
    Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>,
    {
      headers: {
        "Content-Type": record.mimeType,
        "Content-Length": String(byteSize),
        // The file name is a UUID and content never changes, so it is immutable.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    },
  );
});
