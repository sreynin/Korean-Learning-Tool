import { ValidationError } from "@/server/errors";
import { jsonCreated, jsonOk, parseJsonBody, route, toFieldIssues } from "@/server/http";
import { createProject, listProjects } from "@/server/services/project-service";
import {
  createProjectSchema,
  projectListFiltersSchema,
} from "@/server/validation/project-schemas";

export const GET = route(async (request: Request) => {
  const params = new URL(request.url).searchParams;

  const filters = projectListFiltersSchema.safeParse({
    status: params.get("status") ?? undefined,
    format: params.get("format") ?? undefined,
    search: params.get("search") ?? undefined,
  });

  if (!filters.success) {
    throw new ValidationError(
      "Invalid query parameters.",
      toFieldIssues(filters.error),
    );
  }

  return jsonOk(await listProjects(filters.data));
});

export const POST = route(async (request: Request) => {
  const input = await parseJsonBody(request, createProjectSchema);
  return jsonCreated(await createProject(input));
});
