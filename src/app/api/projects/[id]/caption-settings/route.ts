import { NotFoundError } from "@/server/errors";
import { jsonOk, parseJsonBody, route } from "@/server/http";
import { getProjectRepository } from "@/server/repositories";
import { captionSettingsSchema } from "@/server/validation/caption-schemas";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const PUT = route(async (request: Request, context: RouteContext) => {
  const { id } = await context.params;
  const captionSettings = await parseJsonBody(request, captionSettingsSchema);

  const updated = await getProjectRepository().update(id, {
    captionSettings,
    updatedAt: new Date().toISOString(),
  });

  if (!updated) {
    throw new NotFoundError(`No project found with id "${id}".`);
  }

  return jsonOk(updated);
});
