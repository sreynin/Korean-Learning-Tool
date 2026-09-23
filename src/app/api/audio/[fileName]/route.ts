import { NextResponse } from "next/server";
import { NotFoundError } from "@/server/errors";
import { route } from "@/server/http";
import { sceneAudioRepository } from "@/server/repositories/scene-audio-repository";
import { readAudioFile } from "@/server/tts/audio-storage";

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

  const bytes = await readAudioFile(record.fileName);
  if (!bytes) {
    throw new NotFoundError("The audio file is missing from disk.");
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": record.mimeType,
      "Content-Length": String(bytes.byteLength),
      // The file name is a UUID and content never changes, so it is immutable.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
});
