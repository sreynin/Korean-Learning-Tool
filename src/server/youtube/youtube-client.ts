import type { PublishSettings, YouTubeVisibility } from "@/types/youtube";

/**
 * What the publish job needs from YouTube, and nothing more.
 *
 * Everything below this line is the same shape as `Renderer` and
 * `TextToSpeechProvider`: an interface the service depends on, a real
 * implementation, a mock, and one composition point that picks between them.
 * That is what lets the whole publish flow be exercised — and tested — without
 * a Google project or a channel to upload to.
 */

export interface UploadRequest {
  /** Absolute path of the finished MP4. Streamed, never read into memory. */
  filePath: string;
  byteSize: number;
  settings: PublishSettings;
  /** Reports 0-100 across the upload only; processing has no percentage. */
  onProgress: (percent: number) => Promise<void> | void;
  signal?: AbortSignal;
}

export interface UploadResult {
  videoId: string;
  videoUrl: string;
  /** ISO 8601, as YouTube recorded it. */
  publishedAt: string;
  visibility: YouTubeVisibility;
  /** YouTube's own processing state right after the upload. */
  uploadStatus: ProcessingState;
}

/**
 * Where YouTube has got to with a video it has accepted.
 *
 * `rejected` is separate from `failed` because it is final and explains
 * itself — a duplicate, a claim, or terms the video breaks — while `failed`
 * means the transcode broke and may be worth another attempt.
 */
export type ProcessingState =
  | "processing"
  | "succeeded"
  | "failed"
  | "rejected"
  | "unknown";

export interface ProcessingStatus {
  state: ProcessingState;
  /** YouTube's reason when it has one, for the job's error message. */
  detail: string | null;
}

export interface ChannelInfo {
  channelId: string;
  channelTitle: string;
}

export interface YouTubeClient {
  /** "youtube", or "mock" when no credentials are configured. */
  readonly name: string;

  /** True when this client really uploads. The UI says so plainly. */
  readonly uploadsForReal: boolean;

  /** The channel the stored token belongs to. */
  getChannel(): Promise<ChannelInfo>;

  uploadVideo(request: UploadRequest): Promise<UploadResult>;

  /** Polled while YouTube transcodes. */
  getProcessingStatus(videoId: string): Promise<ProcessingStatus>;

  /**
   * Sets a custom thumbnail. Resolves to a message when YouTube refused for a
   * reason worth showing — an unverified channel, most often — and to null on
   * success. It never throws for a refusal: the video is already uploaded, and
   * failing the whole publish over a thumbnail would be worse than saying so.
   */
  setThumbnail(videoId: string, filePath: string): Promise<string | null>;
}
