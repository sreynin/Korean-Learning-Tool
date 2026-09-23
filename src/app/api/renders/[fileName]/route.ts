import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { getRenderOutput } from "@/server/services/render-service";

interface RouteContext {
  params: Promise<{ fileName: string }>;
}

/**
 * Serves a finished render.
 *
 * A `Range` request is answered with the slice it asked for, which is what
 * lets a browser's video element seek and start playing before the whole file
 * has arrived.
 */
export const GET = route(async (request: Request, context: RouteContext) => {
  const { fileName } = await context.params;
  const output = await getRenderOutput(fileName);

  const range = parseRange(request.headers.get("range"), output.byteSize);

  if (!range) {
    return new NextResponse(streamOf(output.filePath), {
      headers: {
        "Content-Type": output.contentType,
        "Content-Length": String(output.byteSize),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  }

  return new NextResponse(streamOf(output.filePath, range), {
    status: 206,
    headers: {
      "Content-Type": output.contentType,
      "Content-Length": String(range.end - range.start + 1),
      "Content-Range": `bytes ${range.start}-${range.end}/${output.byteSize}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
});

function streamOf(
  filePath: string,
  range?: { start: number; end: number },
): ReadableStream<Uint8Array> {
  return Readable.toWeb(
    createReadStream(filePath, range),
  ) as ReadableStream<Uint8Array>;
}

/** `bytes=start-end`, with either end optional. Anything else is ignored. */
function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | null {
  const match = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null;
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  // A suffix range ("bytes=-500") asks for the last N bytes.
  const start = rawStart ? Number(rawStart) : Math.max(0, size - Number(rawEnd));
  const end = rawStart && rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1;

  if (start > end || start >= size) return null;

  return { start, end };
}
