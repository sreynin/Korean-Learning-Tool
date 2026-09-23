import { NextResponse } from "next/server";
import { NotFoundError } from "@/server/errors";
import { route } from "@/server/http";
import { getDb } from "@/server/db/client";
import { readRenderFile } from "@/server/render/render-storage";

interface RouteContext {
  params: Promise<{ fileName: string }>;
}

/**
 * Serves a finished render. The name is looked up against completed jobs
 * first, so only files this app actually produced can be read.
 */
export const GET = route(async (_request: Request, context: RouteContext) => {
  const { fileName } = await context.params;

  const job = await getDb().renderJob.findFirst({
    where: { outputFileName: fileName, status: "completed" },
    select: { outputFileName: true },
  });

  if (!job?.outputFileName) {
    throw new NotFoundError("No render found with that name.");
  }

  const bytes = await readRenderFile(job.outputFileName);
  if (!bytes) {
    throw new NotFoundError("The render file is missing from disk.");
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      // Step 8 replaces this with video/mp4 once real encoding lands.
      "Content-Type": "application/json",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
});
