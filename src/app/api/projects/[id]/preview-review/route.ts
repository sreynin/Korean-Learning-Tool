import { z } from "zod";
import { jsonOk, parseJsonBody, route } from "@/server/http";
import { setPreviewReviewed } from "@/server/services/caption-service";

const bodySchema = z.object({ reviewed: z.boolean() });

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const PUT = route(async (request: Request, context: RouteContext) => {
  const { id } = await context.params;
  const { reviewed } = await parseJsonBody(request, bodySchema);
  return jsonOk(await setPreviewReviewed(id, reviewed));
});
