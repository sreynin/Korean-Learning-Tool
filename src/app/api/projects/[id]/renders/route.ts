import { jsonCreated, jsonOk, route } from "@/server/http";
import { listRenderJobs, startRender } from "@/server/services/render-service";

/**
 * No long `maxDuration` here on purpose: this route creates a job and returns.
 * The render happens on the queue, so the request never waits for it.
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Starts a render. Returns the job, not the video. */
export const POST = route(async (_request: Request, context: RouteContext) => {
  const { id } = await context.params;
  const { job, project } = await startRender(id);

  return jsonCreated({ job, project });
});

export const GET = route(async (_request: Request, context: RouteContext) => {
  const { id } = await context.params;
  return jsonOk(await listRenderJobs(id));
});
