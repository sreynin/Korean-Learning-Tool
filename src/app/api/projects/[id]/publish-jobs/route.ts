import { jsonCreated, jsonOk, parseJsonBody, route } from "@/server/http";
import { listPublishJobs, startPublish } from "@/server/services/publish-service";
import { startPublishSchema } from "@/server/validation/publish-schemas";

/**
 * No long `maxDuration` here on purpose: this route creates a job and returns.
 * The upload happens on the queue, so the request never waits for it.
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Starts a publish. **Only ever reached from a button the creator pressed.**
 *
 * The body carries `confirm: true` alongside the settings, so a request that
 * merely looks like a form submission — a replayed fetch, a double-bound
 * handler — cannot put a video on someone's channel.
 */
export const POST = route(async (request: Request, context: RouteContext) => {
  const { id } = await context.params;
  const body = await parseJsonBody(request, startPublishSchema);

  // `confirm` proves the request was meant; it is not part of what gets
  // published, so it stops here.
  const { confirm, ...input } = body;
  void confirm;

  return jsonCreated(await startPublish(id, input));
});

export const GET = route(async (_request: Request, context: RouteContext) => {
  const { id } = await context.params;
  return jsonOk(await listPublishJobs(id));
});
