import { getProjectRepository } from "@/server/repositories";
import { getPublishJobRepository } from "@/server/repositories/publish-job-repository";
import { renderFilePath, renderFileSize } from "@/server/render/render-storage";
import { getRenderJobRepository } from "@/server/repositories/render-job-repository";
import { syncDerivedState } from "@/server/services/pipeline-service";
import { getYouTubeClient } from "@/server/youtube";
import type { ProjectRepository } from "@/server/repositories";
import type { PublishJobRepository } from "@/server/repositories/publish-job-repository";
import type { RenderJobRepository } from "@/server/repositories/render-job-repository";
import type { YouTubeClient } from "@/server/youtube/youtube-client";
import type { PublishJob } from "@/types/youtube";

/**
 * Hands a publish job to whatever will execute it.
 *
 * Same contract as `RenderQueue`: implementations return immediately, because
 * the request that starts an upload is not allowed to wait for it.
 */
export interface PublishQueue {
  enqueue(jobId: string): Promise<void>;
}

export class InProcessPublishQueue implements PublishQueue {
  private readonly client: YouTubeClient;
  private readonly jobs: PublishJobRepository;
  private readonly projects: ProjectRepository;
  private readonly onSettled?: () => void;

  constructor(options: {
    client?: YouTubeClient;
    jobs?: PublishJobRepository;
    projects?: ProjectRepository;
    /** Test hook: called after a job reaches a terminal state. */
    onSettled?: () => void;
  } = {}) {
    this.client = options.client ?? getYouTubeClient();
    this.jobs = options.jobs ?? getPublishJobRepository();
    this.projects = options.projects ?? getProjectRepository();
    this.onSettled = options.onSettled;
  }

  async enqueue(jobId: string): Promise<void> {
    await this.jobs.markQueued(jobId);

    // Deliberately not awaited: the caller is an HTTP request.
    void this.run(jobId).catch((error) => {
      console.error("[publish] worker crashed", error);
    });
  }

  /** Exposed so the tests and a worker process can drive a job to the end. */
  async run(jobId: string): Promise<void> {
    await runPublishJob({
      jobId,
      client: this.client,
      jobs: this.jobs,
      projects: this.projects,
    });
    this.onSettled?.();
  }
}

/**
 * How long to wait for YouTube to finish transcoding before giving up on
 * watching. The video still exists either way — this only bounds how long the
 * job sits in `processing`.
 */
const PROCESSING_POLL_INTERVAL_MS = 5_000;
const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Executes one publish job and records the outcome.
 *
 * The order matters, and it is chosen around one fact: **once bytes reach
 * YouTube, a video exists whether this job survives or not.** So the video id
 * is written the moment the upload returns, before processing is polled and
 * before anything else can fail. A crash after that point leaves a job that
 * says exactly which video it created; the alternative is an upload nobody
 * can trace.
 *
 * For the same reason nothing here retries automatically. A retried upload is
 * a second video on the creator's channel, not a second attempt at the first
 * one.
 */
export async function runPublishJob(options: {
  jobId: string;
  client: YouTubeClient;
  jobs: PublishJobRepository;
  projects?: ProjectRepository;
  renders?: RenderJobRepository;
  signal?: AbortSignal;
  /** Overridable so tests do not wait on real polling intervals. */
  pollIntervalMs?: number;
}): Promise<void> {
  const { jobId, client, jobs, signal } = options;
  const projects = options.projects ?? getProjectRepository();
  const renders = options.renders ?? getRenderJobRepository();
  const pollIntervalMs = options.pollIntervalMs ?? PROCESSING_POLL_INTERVAL_MS;

  // Whoever wins the claim owns the job; everyone else returns quietly.
  if (!(await jobs.claim(jobId))) return;

  const job = await jobs.findById(jobId);
  if (!job) return;

  try {
    const source = await resolveSourceVideo(job, renders);

    const result = await client.uploadVideo({
      filePath: source.filePath,
      byteSize: source.byteSize,
      settings: job.settings,
      signal,
      onProgress: (percent) => jobs.updateProgress(jobId, percent),
    });

    // The video exists from here on. Record it before anything else can throw.
    await jobs.markProcessing(jobId, {
      videoId: result.videoId,
      videoUrl: result.videoUrl,
      publishedAt: result.publishedAt,
      visibility: result.visibility,
    });

    if (job.settings.thumbnail === "render_poster" && source.posterPath) {
      const warning = await client.setThumbnail(result.videoId, source.posterPath);
      if (warning) await jobs.setWarning(jobId, warning);
    }

    const processing = await waitForProcessing({
      client,
      videoId: result.videoId,
      initialState: result.uploadStatus,
      pollIntervalMs,
      signal,
    });

    if (processing.state === "rejected" || processing.state === "failed") {
      // The video is on the channel but unusable. Say so, and keep the id:
      // the creator needs it to find and delete the video.
      await jobs.markFailed(
        jobId,
        `YouTube could not process the video${processing.detail ? `: ${processing.detail}` : "."} It was uploaded as ${result.videoId} — remove it on YouTube before publishing again.`,
      );
    } else {
      await jobs.markCompleted(jobId);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The publish failed unexpectedly.";
    console.error("[publish] job failed", jobId, message);
    await jobs.markFailed(jobId, message);
  }

  await recordOnProject(jobId, job.projectId, jobs, projects);
}

/**
 * Copies a finished publish onto the project.
 *
 * `publishedAt` and `youtubeUrl` are what `deriveProjectStatus()` reads to
 * return `published`, so this is the step that turns a completed upload into
 * the status the library filters on. A failed job writes nothing: a project
 * must never look published because an upload was attempted.
 */
async function recordOnProject(
  jobId: string,
  projectId: string,
  jobs: PublishJobRepository,
  projects: ProjectRepository,
): Promise<void> {
  const settled = await jobs.findById(jobId);
  const project = await projects.findById(projectId);
  if (!project) return;

  if (settled?.status === "completed" && settled.publication) {
    const updated = await projects.update(projectId, {
      publishedAt: settled.publication.publishedAt,
      youtubeUrl: settled.publication.videoUrl,
      updatedAt: new Date().toISOString(),
    });

    await syncDerivedState(updated ?? project, projects);
    return;
  }

  await syncDerivedState(project, projects);
}

interface SourceVideo {
  filePath: string;
  byteSize: number;
  posterPath: string | null;
}

/**
 * Finds the rendered file for the cut being published.
 *
 * Resolved from a completed render job rather than from anything the request
 * supplied, which is what stops a publish uploading a file this app did not
 * produce.
 */
async function resolveSourceVideo(
  job: PublishJob,
  renders: RenderJobRepository,
): Promise<SourceVideo> {
  const all = await renders.listForProject(job.projectId);
  const finished = all.find(
    (candidate) =>
      candidate.format === job.format &&
      candidate.status === "completed" &&
      candidate.outputUrl,
  );

  if (!finished?.outputUrl) {
    throw new Error(
      "There is no finished render for this cut any more. Render it again before publishing.",
    );
  }

  const fileName = finished.outputUrl.split("/").pop() as string;
  const byteSize = await renderFileSize(fileName);

  if (byteSize === null) {
    throw new Error(
      "The rendered video is missing from disk. Render it again before publishing.",
    );
  }

  const posterName = finished.posterUrl?.split("/").pop() ?? null;

  return {
    filePath: renderFilePath(fileName),
    byteSize,
    posterPath: posterName ? renderFilePath(posterName) : null,
  };
}

async function waitForProcessing(options: {
  client: YouTubeClient;
  videoId: string;
  initialState: string;
  pollIntervalMs: number;
  signal?: AbortSignal;
}) {
  const { client, videoId, initialState, pollIntervalMs, signal } = options;

  if (initialState === "succeeded") {
    return { state: "succeeded" as const, detail: null };
  }

  const deadline = Date.now() + PROCESSING_TIMEOUT_MS;

  while (Date.now() < deadline) {
    signal?.throwIfAborted();

    const status = await client.getProcessingStatus(videoId);
    if (status.state !== "processing" && status.state !== "unknown") {
      return status;
    }

    await sleep(pollIntervalMs, signal);
  }

  // A slow transcode is not a failed publish: the video is up, and YouTube
  // will finish in its own time.
  return { state: "succeeded" as const, detail: null };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/** Cached on `globalThis` so hot reloads reuse the queue, as the renderer is. */
const globalForPublishQueue = globalThis as unknown as {
  __publishQueue?: PublishQueue;
};

export function getPublishQueue(): PublishQueue {
  if (!globalForPublishQueue.__publishQueue) {
    globalForPublishQueue.__publishQueue = new InProcessPublishQueue();
  }
  return globalForPublishQueue.__publishQueue;
}
