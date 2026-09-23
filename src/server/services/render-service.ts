import { ConflictError, NotFoundError } from "@/server/errors";
import { getRenderJobRepository } from "@/server/repositories/render-job-repository";
import { getRenderQueue } from "@/server/render";
import { getProject } from "@/server/services/project-service";
import { syncPipeline } from "@/server/services/pipeline-service";
import type { RenderJob } from "@/types/render";
import type { VideoProject } from "@/types/project";

export interface StartRenderResult {
  job: RenderJob;
  project: VideoProject;
}

/**
 * Creates a render job and hands it to the queue.
 *
 * This returns as soon as the job row exists. It never waits for the render —
 * that is the whole point of the job model, and why the route has no long
 * `maxDuration`.
 */
export async function startRender(projectId: string): Promise<StartRenderResult> {
  const project = await getProject(projectId);
  assertRenderable(project);

  const jobs = getRenderJobRepository();
  const job = await jobs.createIfIdle(projectId);

  if (!job) {
    throw new ConflictError(
      "A render is already in progress for this project. Wait for it to finish before starting another.",
    );
  }

  await getRenderQueue().enqueue(job.id);

  // Reflect the newly active job in the pipeline before returning.
  const updated = await syncPipeline(await getProject(projectId));

  return { job: (await jobs.findById(job.id)) ?? job, project: updated };
}

export async function getRenderJob(
  projectId: string,
  jobId: string,
): Promise<RenderJob> {
  const job = await getRenderJobRepository().findById(jobId);

  if (!job || job.projectId !== projectId) {
    throw new NotFoundError(`No render job found with id "${jobId}".`);
  }

  return job;
}

export async function listRenderJobs(projectId: string): Promise<RenderJob[]> {
  await getProject(projectId);
  return getRenderJobRepository().listForProject(projectId);
}

/**
 * What a project needs before it can be rendered at all.
 *
 * Deliberately minimal: a storyboard is the only thing a renderer cannot work
 * without. Stricter requirements (every scene voiced, assets generated) belong
 * with the renderer that actually needs them.
 */
export function assertRenderable(project: VideoProject): void {
  const scenes = project.scenes?.scenes ?? [];

  if (scenes.length === 0) {
    throw new ConflictError(
      "This project has no storyboard yet, so there is nothing to render.",
    );
  }
}
