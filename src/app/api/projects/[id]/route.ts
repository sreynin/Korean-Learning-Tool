import { jsonOk, parseJsonBody, route } from "@/server/http";
import {
  deleteProject,
  getProject,
  updateProject,
} from "@/server/services/project-service";
import { updateProjectSchema } from "@/server/validation/project-schemas";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const GET = route(async (_request: Request, context: RouteContext) => {
  const { id } = await context.params;
  return jsonOk(await getProject(id));
});

export const PATCH = route(async (request: Request, context: RouteContext) => {
  const { id } = await context.params;
  const input = await parseJsonBody(request, updateProjectSchema);
  return jsonOk(await updateProject(id, input));
});

export const DELETE = route(async (_request: Request, context: RouteContext) => {
  const { id } = await context.params;
  await deleteProject(id);
  return jsonOk({ id, deleted: true });
});
