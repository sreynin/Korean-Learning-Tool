import { jsonOk, parseJsonBody, route } from "@/server/http";
import { storyboardEditSchema } from "@/server/ai/scene-schema";
import {
  generateScenesForProject,
  saveScenes,
} from "@/server/services/scene-service";

export const maxDuration = 300;

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Builds a storyboard from the project's saved lesson and stores it. */
export const POST = route(async (_request: Request, context: RouteContext) => {
  const { id } = await context.params;
  const { scenes, model } = await generateScenesForProject(id);
  const project = await saveScenes(id, scenes, { model, edited: false });

  return jsonOk(project);
});

/** Saves an edited storyboard. */
export const PUT = route(async (request: Request, context: RouteContext) => {
  const { id } = await context.params;
  const { scenes } = await parseJsonBody(request, storyboardEditSchema);
  const project = await saveScenes(id, scenes, {
    model: "manual",
    edited: true,
  });

  return jsonOk(project);
});
