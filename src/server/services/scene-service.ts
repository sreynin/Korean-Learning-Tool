import { randomUUID } from "node:crypto";
import { ConflictError, NotFoundError } from "@/server/errors";
import { getSceneGenerator } from "@/server/ai";
import { getProjectRepository } from "@/server/repositories";
import { getProject } from "@/server/services/project-service";
import { producesShorts } from "@/types/project";
import type { VideoProject } from "@/types/project";
import type { GeneratedScene, Scene, StoredScenes } from "@/types/scene";

export interface GeneratedSceneResult {
  scenes: Scene[];
  model: string;
}

/**
 * Builds a storyboard from a project's saved lesson. The lesson is the input,
 * so it must exist first — this is the one pipeline dependency that is real.
 */
export async function generateScenesForProject(
  projectId: string,
): Promise<GeneratedSceneResult> {
  const project = await getProject(projectId);

  if (!project.lesson) {
    throw new ConflictError(
      "Generate a lesson before creating scenes — the storyboard is built from it.",
    );
  }

  const { scenes, model } = await getSceneGenerator().generate({
    lesson: project.lesson.content,
    videoFormat: project.format,
    visualStyle: project.visualStyle,
    targetDurationSeconds: storyboardTargetSeconds(project),
  });

  return { scenes: withIdentity(scenes), model };
}

/**
 * Which cut the storyboard is timed against. A "both" project is written at
 * long-form length and cut down, matching what the prompt asks for.
 */
export function storyboardTargetSeconds(project: VideoProject): number {
  if (project.format === "both") {
    return project.longDurationSeconds ?? project.shortsDurationSeconds ?? 300;
  }
  return producesShorts(project.format)
    ? (project.shortsDurationSeconds ?? 30)
    : (project.longDurationSeconds ?? 300);
}

/**
 * Attaches a storyboard to a project and marks the pipeline's scenes stage
 * complete. `edited` distinguishes a fresh generation from a manual save.
 */
/**
 * Scene audio lives in its own table keyed by scene id, so it is neither sent
 * by the editor nor written here — it survives a storyboard save untouched.
 */
export type SceneInput = Omit<Scene, "audio">;

export async function saveScenes(
  projectId: string,
  scenes: SceneInput[],
  options: { model: string; edited: boolean },
): Promise<VideoProject> {
  const existing = await getProject(projectId);
  const now = new Date().toISOString();

  const stored: StoredScenes = {
    // Renumber from array position so `order` can never disagree with it.
    scenes: scenes.map((scene, index) => ({
      ...scene,
      order: index + 1,
      audio: null,
    })),
    generatedAt: options.edited ? (existing.scenes?.generatedAt ?? now) : now,
    model: options.edited ? (existing.scenes?.model ?? options.model) : options.model,
    editedAt: options.edited ? now : null,
  };

  const updated = await getProjectRepository().update(projectId, {
    scenes: stored,
    status: existing.status === "draft" ? "in_progress" : existing.status,
    pipeline: {
      ...existing.pipeline,
      scenes: { status: "complete", updatedAt: now },
    },
    updatedAt: now,
  });

  if (!updated) {
    throw new NotFoundError(`No project found with id "${projectId}".`);
  }
  return updated;
}

/** Assigns the ids and ordering the model deliberately does not produce. */
function withIdentity(scenes: GeneratedScene[]): Scene[] {
  return scenes.map((scene, index) => ({
    ...scene,
    id: randomUUID(),
    order: index + 1,
    // Narration audio is generated later, by the voice stage.
    audio: null,
  }));
}
