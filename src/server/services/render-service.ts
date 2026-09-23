import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { getRenderJobRepository } from "@/server/repositories/render-job-repository";
import { getRenderQueue } from "@/server/render";
import { renderFilePath, renderFileSize } from "@/server/render/render-storage";
import { getProject } from "@/server/services/project-service";
import { syncPipeline } from "@/server/services/pipeline-service";
import { producesLongForm, producesShorts } from "@/types/project";
import type { RenderFormat, RenderJob } from "@/types/render";
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
export async function startRender(
  projectId: string,
  requestedFormat?: RenderFormat,
): Promise<StartRenderResult> {
  const project = await getProject(projectId);
  assertRenderable(project);

  const format = resolveRenderFormat(project, requestedFormat);
  const jobs = getRenderJobRepository();
  const job = await jobs.createIfIdle(projectId, format);

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

export interface RenderOutput {
  filePath: string;
  contentType: string;
  byteSize: number;
}

/**
 * Locates a finished render for serving.
 *
 * The name is resolved against a completed job rather than trusted from the
 * URL, so only files this app produced can be read, and the content type comes
 * from the row instead of being guessed from the extension.
 */
export async function getRenderOutput(fileName: string): Promise<RenderOutput> {
  const job = await getRenderJobRepository().findCompletedByOutput(fileName);

  if (!job) {
    throw new NotFoundError("No render found with that name.");
  }

  const size = await renderFileSize(fileName);

  if (size === null) {
    throw new NotFoundError("The render file is missing from disk.");
  }

  return {
    filePath: renderFilePath(fileName),
    contentType: job.contentType ?? "video/mp4",
    byteSize: size,
  };
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

/**
 * Which cut to render.
 *
 * A project that produces one cut renders that one, and asking for the other
 * is a mistake worth reporting rather than quietly ignoring. A `both` project
 * renders each cut separately, one job at a time, defaulting to the Short.
 */
export function resolveRenderFormat(
  project: VideoProject,
  requested?: RenderFormat,
): RenderFormat {
  const available: RenderFormat[] = [
    ...(producesShorts(project.format) ? (["shorts"] as const) : []),
    ...(producesLongForm(project.format) ? (["long"] as const) : []),
  ];

  if (!requested) return available[0];

  if (!available.includes(requested)) {
    throw new ValidationError(
      `This project does not produce a ${requested === "shorts" ? "Short" : "long-form video"}.`,
      [{ field: "format", message: "Not produced by this project's format." }],
    );
  }

  return requested;
}
