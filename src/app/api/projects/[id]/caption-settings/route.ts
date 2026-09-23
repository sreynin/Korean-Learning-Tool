import { jsonOk, parseJsonBody, route } from "@/server/http";
import { updateCaptionSettings } from "@/server/services/caption-service";
import { captionSettingsSchema } from "@/server/validation/caption-schemas";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const PUT = route(async (request: Request, context: RouteContext) => {
  const { id } = await context.params;
  const settings = await parseJsonBody(request, captionSettingsSchema);
  return jsonOk(await updateCaptionSettings(id, settings));
});
