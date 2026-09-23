import { jsonOk, route } from "@/server/http";
import { getRenderJob } from "@/server/services/render-service";

interface RouteContext {
  params: Promise<{ id: string; jobId: string }>;
}

/** Polled by the client while a render is in flight. */
export const GET = route(async (_request: Request, context: RouteContext) => {
  const { id, jobId } = await context.params;
  return jsonOk(await getRenderJob(id, jobId));
});
