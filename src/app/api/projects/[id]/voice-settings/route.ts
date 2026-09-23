import { jsonOk, parseJsonBody, route } from "@/server/http";
import { updateVoiceSettings } from "@/server/services/voice-service";
import { voiceSettingsSchema } from "@/server/validation/voice-schemas";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const PUT = route(async (request: Request, context: RouteContext) => {
  const { id } = await context.params;
  const settings = await parseJsonBody(request, voiceSettingsSchema);
  return jsonOk(await updateVoiceSettings(id, settings));
});
