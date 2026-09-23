import { ValidationError } from "@/server/errors";
import { jsonOk, route, toFieldIssues } from "@/server/http";
import {
  deleteSceneAudio,
  generateSceneAudio,
} from "@/server/services/voice-service";
import { generateAudioSchema } from "@/server/validation/voice-schemas";

/** Synthesis can take a while for a long narration. */
export const maxDuration = 300;

interface RouteContext {
  params: Promise<{ id: string; sceneId: string }>;
}

/** Generates (or regenerates) narration for one scene. */
export const POST = route(async (request: Request, context: RouteContext) => {
  const { id, sceneId } = await context.params;

  // Per-scene overrides are optional, so an empty body is valid.
  const raw = (await request.text()).trim();
  let overrides;

  if (raw) {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      throw new ValidationError("Request body must be valid JSON.");
    }

    const result = generateAudioSchema.safeParse(parsedJson);
    if (!result.success) {
      throw new ValidationError(
        "The submitted data is invalid.",
        toFieldIssues(result.error),
      );
    }
    overrides = result.data;
  }

  return jsonOk(await generateSceneAudio(id, sceneId, overrides));
});

export const DELETE = route(async (_request: Request, context: RouteContext) => {
  const { id, sceneId } = await context.params;
  return jsonOk(await deleteSceneAudio(id, sceneId));
});
