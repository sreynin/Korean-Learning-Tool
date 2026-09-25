import { jsonOk, route } from "@/server/http";
import { getPublishJob } from "@/server/services/publish-service";

interface RouteContext {
  params: Promise<{ id: string; jobId: string }>;
}

/** Polled by the client while an upload is in flight. */
export const GET = route(async (_request: Request, context: RouteContext) => {
  const { id, jobId } = await context.params;
  return jsonOk(await getPublishJob(id, jobId));
});
