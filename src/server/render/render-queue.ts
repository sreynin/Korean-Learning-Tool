import { getProjectRepository } from "@/server/repositories";
import { getRenderJobRepository } from "@/server/repositories/render-job-repository";
import { deleteRenderFile } from "@/server/render/render-storage";
import { syncDerivedState } from "@/server/services/pipeline-service";
import type { ProjectRepository } from "@/server/repositories";
import type { RenderJobRepository } from "@/server/repositories/render-job-repository";
import type { Renderer } from "@/server/render/renderer";
import { createLogger } from "@/server/logger";

const log = createLogger("render");

/**
 * How long a single render may run before it is killed.
 *
 * Nothing bounded this before: `runFfmpeg` accepts an `AbortSignal` and
 * `runRenderJob` passes one through, but no caller ever supplied one, so a
 * wedged FFmpeg process ran until the machine was restarted — and held the
 * project's only render slot while it did.
 */
export const RENDER_TIMEOUT_MS = 20 * 60 * 1000;

/**
 * How many renders may encode at once.
 *
 * One job per project was the only limit, so N projects meant N concurrent
 * FFmpeg processes, each saturating what cores it could get. Past a small
 * number they do not finish sooner, they just finish together and make the
 * machine unusable meanwhile.
 */
export const MAX_CONCURRENT_RENDERS = 2;

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
  private readonly gate: ConcurrencyGate;

  constructor(options: {
    renderer: Renderer;
    jobs?: RenderJobRepository;
    projects?: ProjectRepository;
    /** Test hook: called after a job reaches a terminal state. */
    onSettled?: () => void;
    /** Overridable so a worker process can choose its own limit. */
    maxConcurrent?: number;
  }) {
    this.renderer = options.renderer;
    this.jobs = options.jobs ?? getRenderJobRepository();
    this.projects = options.projects ?? getProjectRepository();
    this.onSettled = options.onSettled;
    this.gate = new ConcurrencyGate(
      options.maxConcurrent ?? MAX_CONCURRENT_RENDERS,
    );
  }

  async enqueue(jobId: string): Promise<void> {
    await this.jobs.markQueued(jobId);

    // Deliberately not awaited: the caller is an HTTP request.
    void this.run(jobId).catch((error) => {
      log.error("worker crashed", error);
    });
  }

  /** Exposed so a worker process and the tests can drive a job to completion. */
  async run(jobId: string): Promise<void> {
    await this.gate.run(() =>
      runRenderJob({
        jobId,
        renderer: this.renderer,
        jobs: this.jobs,
        projects: this.projects,
        signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
      }),
    );
    this.onSettled?.();
  }
}

/**
 * Lets a fixed number of tasks run at once and queues the rest.
 *
 * Deliberately tiny and in-process: it bounds this process, which is the same
 * scope `InProcessRenderQueue` already has. A deployment with several
 * instances needs the limit to live in the queue itself, which is the same
 * change as replacing the queue.
 */
export class ConcurrencyGate {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }

    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
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
      posterFileName: result.posterFileName,
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

    const message = signal?.aborted
      ? `The render was stopped after ${Math.round(RENDER_TIMEOUT_MS / 60000)} minutes without finishing.`
      : error instanceof Error
        ? error.message
        : "The render failed unexpectedly.";
    log.error("job failed", { jobId, reason: message });
    await jobs.markFailed(jobId, message);
  }

  // The stage moved to in_progress when the job was created, so a settled job
  // has to be reflected too — otherwise a finished render leaves the pipeline
  // claiming a render is still running.
  const project = await projects.findById(job.projectId);
  if (project) {
    await syncDerivedState(project, projects);
  }
}
