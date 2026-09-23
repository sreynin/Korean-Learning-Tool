import { getProjectRepository } from "@/server/repositories";
import { getRenderJobRepository } from "@/server/repositories/render-job-repository";
import { deleteRenderFile } from "@/server/render/render-storage";
import { syncPipeline } from "@/server/services/pipeline-service";
import type { ProjectRepository } from "@/server/repositories";
import type { RenderJobRepository } from "@/server/repositories/render-job-repository";
import type { Renderer } from "@/server/render/renderer";

/**
 * Hands a job to whatever will execute it.
 *
 * Implementations must return immediately — the HTTP request that enqueues a
 * render is not allowed to wait for it. Swapping this for a real queue later
 * means writing one new implementation; the job row stays the contract.
 */
export interface RenderQueue {
  enqueue(jobId: string): Promise<void>;
}

/**
 * Runs jobs in the current process, after the request has returned.
 *
 * This is the smallest thing that genuinely decouples rendering from the
 * request without adding infrastructure. Its limits are deliberate and worth
 * knowing: work is lost if the process exits mid-render, and it does not span
 * multiple instances. Both are fixed by pointing `RenderQueue` at a real queue
 * — the job row already carries everything a external worker would need, and
 * `scripts/render-worker.ts` drains the same rows from a separate process.
 */
export class InProcessRenderQueue implements RenderQueue {
  private readonly renderer: Renderer;
  private readonly jobs: RenderJobRepository;
  private readonly projects: ProjectRepository;
  private readonly onSettled?: () => void;

  constructor(options: {
    renderer: Renderer;
    jobs?: RenderJobRepository;
    projects?: ProjectRepository;
    /** Test hook: called after a job reaches a terminal state. */
    onSettled?: () => void;
  }) {
    this.renderer = options.renderer;
    this.jobs = options.jobs ?? getRenderJobRepository();
    this.projects = options.projects ?? getProjectRepository();
    this.onSettled = options.onSettled;
  }

  async enqueue(jobId: string): Promise<void> {
    await this.jobs.markQueued(jobId);

    // Deliberately not awaited: the caller is an HTTP request.
    void this.run(jobId).catch((error) => {
      console.error("[render] worker crashed", error);
    });
  }

  /** Exposed so a worker process and the tests can drive a job to completion. */
  async run(jobId: string): Promise<void> {
    await runRenderJob({
      jobId,
      renderer: this.renderer,
      jobs: this.jobs,
      projects: this.projects,
    });
    this.onSettled?.();
  }
}

/**
 * Executes one job and records the outcome.
 *
 * Shared by the in-process queue and the standalone worker so there is exactly
 * one definition of what running a render means.
 */
export async function runRenderJob(options: {
  jobId: string;
  renderer: Renderer;
  jobs: RenderJobRepository;
  /** Storage the render reads the project from. Injected so a worker process
   * and the tests run against their own connection. */
  projects?: ProjectRepository;
  signal?: AbortSignal;
}): Promise<void> {
  const { jobId, renderer, jobs, signal } = options;
  const projects = options.projects ?? getProjectRepository();

  // Whoever wins the claim owns the job; everyone else returns quietly.
  if (!(await jobs.claim(jobId))) return;

  const job = await jobs.findById(jobId);
  if (!job) return;

  let outputFileName: string | null = null;

  try {
    const project = await projects.findById(job.projectId);
    if (!project) {
      throw new Error(`No project found with id "${job.projectId}".`);
    }

    const result = await renderer.render({
      jobId,
      project,
      format: job.format,
      signal,
      onProgress: (percent) => jobs.updateProgress(jobId, percent),
    });

    outputFileName = result.outputFileName;
    await jobs.markCompleted(jobId, {
      fileName: result.outputFileName,
      contentType: result.contentType,
      byteSize: result.byteSize,
    });
  } catch (error) {
    // A failed render must leave the project exactly as it was. Only the job
    // records the failure, and any partial file is removed so nothing can be
    // served as if it were a finished video.
    if (outputFileName) {
      await deleteRenderFile(outputFileName);
    }

    const message =
      error instanceof Error ? error.message : "The render failed unexpectedly.";
    console.error("[render] job failed", jobId, message);
    await jobs.markFailed(jobId, message);
  }

  // The stage moved to in_progress when the job was created, so a settled job
  // has to be reflected too — otherwise a finished render leaves the pipeline
  // claiming a render is still running.
  const project = await projects.findById(job.projectId);
  if (project) {
    await syncPipeline(project, projects);
  }
}
