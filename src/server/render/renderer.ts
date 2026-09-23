import type { VideoProject } from "@/types/project";

export interface RenderRequest {
  jobId: string;
  project: VideoProject;
  /**
   * Report 0-100. Called from outside any transaction, so each call is a short
   * independent write.
   */
  onProgress: (percent: number) => Promise<void>;
  /** Aborts when the worker is shutting down. */
  signal?: AbortSignal;
}

export interface RenderResult {
  /** File name inside the render directory. */
  outputFileName: string;
}

/**
 * The boundary between the app and whatever actually produces a video file.
 *
 * Step 8 replaces the implementation with an FFmpeg pipeline. Nothing above
 * this interface — the job model, the queue, the API, the pipeline stage —
 * needs to change when that happens.
 */
export interface Renderer {
  /** Identifier stored with the job, e.g. "ffmpeg" or "mock". */
  readonly name: string;
  render(request: RenderRequest): Promise<RenderResult>;
}
