import { ValidationError } from "@/server/errors";
import { jsonOk, route, toFieldIssues } from "@/server/http";
import { listVoices } from "@/server/services/voice-service";
import { voiceQuerySchema } from "@/server/validation/voice-schemas";

export const GET = route(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const parsed = voiceQuerySchema.safeParse({
    language: params.get("language") ?? undefined,
  });

  if (!parsed.success) {
    throw new ValidationError(
      "Invalid query parameters.",
      toFieldIssues(parsed.error),
    );
  }

  return jsonOk(await listVoices(parsed.data.language));
});
