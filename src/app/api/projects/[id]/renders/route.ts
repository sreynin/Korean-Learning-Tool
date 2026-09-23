import { z } from "zod";
import { jsonCreated, jsonOk, parseJsonBody, route } from "@/server/http";
import { listRenderJobs, startRender } from "@/server/services/render-service";
import { RENDER_FORMATS } from "@/types/render";

/**
 * No long `maxDuration` here on purpose: this route creates a job and returns.
 * The render happens on the queue, so the request never waits for it.
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Starts a render. Returns the job, not the video.
 *
 * The body is optional — only a `both` project has a choice to make, and it
 * defaults to the Short.
 */
const startSchema = z.object({ format: z.enum(RENDER_FORMATS).optional() });

export const POST = route(async (request: Request, context: RouteContext) => {
  const { id } = await context.params;
  const { format } = await parseOptionalBody(request);
  const { job, project } = await startRender(id, format);

  return jsonCreated({ job, project });
});

async function parseOptionalBody(request: Request) {
  const raw = await request.clone().text();
  if (!raw.trim()) return {};

  return parseJsonBody(request, startSchema);
}

export const GET = route(async (_request: Request, context: RouteContext) => {
  const { id } = await context.params;
  return jsonOk(await listRenderJobs(id));
});
