import { getProjectRepository } from "@/server/repositories";
import { PIPELINE_STAGES } from "@/types/project";
import { isActiveRender } from "@/types/render";
import { metadataFormats } from "@/types/metadata";
import type { ProjectRepository } from "@/server/repositories";
import type {
  PipelineStage,
  ProjectStatus,
  ProjectPipeline,
  StageState,
  StageStatus,
  VideoProject,
} from "@/types/project";

/**
 * Stages that have no implementation behind them. They can never be complete,
 * regardless of what a stored record claims — a project cannot have rendered a
 * video with code that does not exist.
 */
const UNIMPLEMENTED_STAGES: PipelineStage[] = ["assets"];

/**
 * Derives every stage's status from what the project actually contains.
 *
 * Status is computed, never set directly. That means a stage cannot drift out
 * of step with reality, and deleting the artifact behind a stage reverts it
 * rather than leaving a stale "complete".
 *
 * Timestamps are preserved when a stage's status has not changed, so
 * reconciling does not rewrite history on every save.
 */
export function reconcilePipeline(
  project: VideoProject,
  now: string = new Date().toISOString(),
): ProjectPipeline {
  const scenes = project.scenes?.scenes ?? [];
  const hasScenes = scenes.length > 0;
  const withAudio = scenes.filter((scene) => scene.audio !== null).length;

  const derived: Record<PipelineStage, StageStatus> = {
    // The topic is supplied when the project is created, so this stage is
    // genuinely done at that point — it is not "complete because it exists".
    topic: "complete",
    lesson: project.lesson ? "complete" : "pending",
    scenes: hasScenes ? "complete" : "pending",
    assets: "pending",
    voice: !hasScenes
      ? "pending"
      : withAudio === scenes.length
        ? "complete"
        : withAudio > 0
          ? "in_progress"
          : "pending",
    // Captions need both a storyboard to caption and settings the creator
    // actually saved. Defaults applied for rendering do not count.
    captions: hasScenes && project.captionsConfigured ? "complete" : "pending",
    // Preview completes on an explicit review, never on a page view.
    preview: hasScenes && project.previewReviewedAt ? "complete" : "pending",
    render: deriveRenderStatus(project),
    youtube: deriveMetadataStatus(project),
  };

  for (const stage of UNIMPLEMENTED_STAGES) {
    derived[stage] = "pending";
  }

  return Object.fromEntries(
    PIPELINE_STAGES.map((stage) => {
      const previous: StageState | undefined = project.pipeline?.[stage];
      const status = derived[stage];

      const state: StageState = {
        status,
        updatedAt:
          previous?.status === status
            ? previous.updatedAt
            : status === "pending"
              ? null
              : now,
      };

      return [stage, state];
    }),
  ) as ProjectPipeline;
}

/**
 * Render maps the job lifecycle onto the three stage statuses the pipeline
 * already uses, rather than introducing a second, incompatible set:
 *
 *   no job, or the only jobs failed  → pending
 *   pending / queued / processing    → in_progress
 *   a completed job with output      → complete
 *
 * A failed job leaves the stage pending because nothing was produced; the
 * failure itself is reported by the job, which carries the error message. An
 * earlier successful render still counts, so a failed retry does not erase
 * output that is still on disk.
 */
/**
 * Metadata is written per cut, so a `both` project is only done when both its
 * Short and its long-form video have a document — one of two is genuinely
 * half-finished, not complete.
 */
function deriveMetadataStatus(project: VideoProject): StageStatus {
  const required = metadataFormats(project.format);
  const written = required.filter((format) =>
    project.metadata.some((entry) => entry.format === format),
  ).length;

  if (written === 0) return "pending";
  return written === required.length ? "complete" : "in_progress";
}

function deriveRenderStatus(project: VideoProject): StageStatus {
  const latest = project.latestRender;

  if (latest && isActiveRender(latest.status)) return "in_progress";
  if (project.hasRenderOutput) return "complete";
  return "pending";
}

/**
 * Where the project has got to, from what it actually contains.
 *
 * The order matters: each status is the furthest point the project has
 * genuinely reached, so the checks run backwards from the end. Nothing here
 * can be set by hand, with one exception — `published` reflects the creator
 * telling us they uploaded it, because no code does that yet.
 */
export function deriveProjectStatus(project: VideoProject): ProjectStatus {
  if (project.publishedAt) return "published";
  if (project.hasRenderOutput) return "completed";
  if (project.latestRender && isActiveRender(project.latestRender.status)) {
    return "rendering";
  }

  const scenes = project.scenes?.scenes ?? [];
  if (scenes.length === 0) return project.lesson ? "lesson_ready" : "draft";

  const voiced = scenes.every((scene) => scene.audio !== null);

  // "Ready to render" is a real claim, so it means every input a good render
  // needs is present: a voiced storyboard with captions the creator chose.
  if (voiced && project.captionsConfigured) return "ready_to_render";
  if (voiced) return "voice_ready";
  return "scenes_ready";
}

/** True when the reconciled pipeline differs from what is stored. */
export function pipelineDiffers(
  current: ProjectPipeline | undefined,
  next: ProjectPipeline,
): boolean {
  return PIPELINE_STAGES.some(
    (stage) => current?.[stage]?.status !== next[stage].status,
  );
}

/**
 * Recomputes and persists everything derived from a project's content — its
 * pipeline stages and its status. Called after anything that changes what the
 * project contains, so no caller holds its own idea of what "complete" means.
 */
export async function syncDerivedState(
  project: VideoProject,
  repository: ProjectRepository = getProjectRepository(),
): Promise<VideoProject> {
  const pipeline = reconcilePipeline(project);
  const status = deriveProjectStatus(project);

  if (!pipelineDiffers(project.pipeline, pipeline) && status === project.status) {
    return project;
  }

  const updated = await repository.update(project.id, {
    pipeline,
    status,
    updatedAt: new Date().toISOString(),
  });

  return updated ?? project;
}
