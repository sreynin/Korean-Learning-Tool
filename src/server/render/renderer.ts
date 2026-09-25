import type { VideoProject } from "@/types/project";
import type { RenderFormat } from "@/types/render";

export interface RenderRequest {
  jobId: string;
  project: VideoProject;
  /** Which cut to produce. A `both` project is rendered once per format. */
  format: RenderFormat;
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
  /** Still taken from it for the library thumbnail, or null if none was made. */
  posterFileName: string | null;
  /** Media type of the output, e.g. `video/mp4`. */
  contentType: string;
  byteSize: number;
}

/**
 * The boundary between the app and whatever actually produces a video file.
 *
 * `FfmpegRenderer` is the implementation; the interface stays because the job
 * model, the queue, the API, and the pipeline stage all depend on it rather
 * than on FFmpeg, and the tests substitute their own renderer here.
 */
export interface Renderer {
  /** Identifier stored with the job, e.g. "ffmpeg" or "mock". */
  readonly name: string;
  render(request: RenderRequest): Promise<RenderResult>;
}
