import { jsonCreated, route } from "@/server/http";
import { duplicateProject } from "@/server/services/library-service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Copies a project's creative work into a new draft. */
export const POST = route(async (_request: Request, context: RouteContext) => {
  const { id } = await context.params;
  return jsonCreated(await duplicateProject(id));
});
