import { getLessonGenerator } from "@/server/ai";
import { getProjectRepository } from "@/server/repositories";
import { NotFoundError } from "@/server/errors";
import { getProject } from "@/server/services/project-service";
import { syncDerivedState } from "@/server/services/pipeline-service";
import type { GeneratedLesson } from "@/server/ai/lesson-generator";
import type { Lesson, LessonGenerationRequest, StoredLesson } from "@/types/lesson";
import type { VideoProject } from "@/types/project";

export async function generateLesson(
  request: LessonGenerationRequest,
): Promise<GeneratedLesson> {
  return getLessonGenerator().generate(request);
}

/**
 * Generates a lesson using a project's own configuration, so the create flow
 * and the editor cannot drift apart on what gets sent to the model.
 */
export async function generateLessonForProject(
  projectId: string,
): Promise<GeneratedLesson> {
  const project = await getProject(projectId);
  return generateLesson(toGenerationRequest(project));
}

export function toGenerationRequest(
  project: VideoProject,
): LessonGenerationRequest {
  return {
    topic: project.topic,
    level: project.level,
    videoType: project.format,
    language: project.targetLanguage,
    style: project.contentStyle,
  };
}

/**
 * Attaches a lesson to a project and marks the pipeline's lesson stage
 * complete. `edited` distinguishes a fresh generation from a manual save.
 */
export async function saveLesson(
  projectId: string,
  lesson: Lesson,
  options: { model: string; edited: boolean },
): Promise<VideoProject> {
  const existing = await getProject(projectId);
  const now = new Date().toISOString();

  const stored: StoredLesson = {
    content: lesson,
    generatedAt: options.edited
      ? (existing.lesson?.generatedAt ?? now)
      : now,
    model: options.edited ? (existing.lesson?.model ?? options.model) : options.model,
    editedAt: options.edited ? now : null,
  };

  const updated = await getProjectRepository().update(projectId, {
    lesson: stored,
    // A project with a lesson is no longer an untouched draft.
    updatedAt: now,
  });

  if (!updated) {
    throw new NotFoundError(`No project found with id "${projectId}".`);
  }

  // Stage status is derived, never set here.
  return syncDerivedState(updated);
}
