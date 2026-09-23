import { jsonOk, parseJsonBody, route } from "@/server/http";
import { lessonEditSchema } from "@/server/ai/lesson-schema";
import {
  generateLessonForProject,
  saveLesson,
} from "@/server/services/lesson-service";

export const maxDuration = 300;

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Generates a lesson from the project's own configuration and stores it. */
export const POST = route(async (_request: Request, context: RouteContext) => {
  const { id } = await context.params;
  const { lesson, model } = await generateLessonForProject(id);
  const project = await saveLesson(id, lesson, { model, edited: false });

  return jsonOk(project);
});

/** Saves an edited lesson. */
export const PUT = route(async (request: Request, context: RouteContext) => {
  const { id } = await context.params;
  const lesson = await parseJsonBody(request, lessonEditSchema);
  const project = await saveLesson(id, lesson, { model: "manual", edited: true });

  return jsonOk(project);
});
