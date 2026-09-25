import { randomUUID } from "node:crypto";
import type {
  ChannelInfo,
  ProcessingStatus,
  UploadRequest,
  UploadResult,
  YouTubeClient,
} from "@/server/youtube/youtube-client";

export const MOCK_YOUTUBE_NAME = "mock";

/**
 * Used when no YouTube credentials are configured.
 *
 * It uploads nothing. It exists so the whole flow — fill in the form, watch
 * the progress, see the result recorded against the project — can be built,
 * tested, and demonstrated before a Google project exists.
 *
 * **Everything it returns says it is a mock.** The channel is named as one,
 * the video id starts with `mock-`, and the URL points at `.invalid`, a domain
 * reserved by RFC 2606 that can never resolve. A plausible-looking
 * youtube.com link would be the one genuinely dangerous thing this file could
 * produce: a creator would click it, find nothing, and have no way to tell
 * whether the upload or the link was wrong.
 */
export class MockYouTubeClient implements YouTubeClient {
  readonly name = MOCK_YOUTUBE_NAME;
  readonly uploadsForReal = false;

  /** Kept short so the mock does not make the UI feel broken. */
  private readonly stepDelayMs: number;

  constructor(options: { stepDelayMs?: number } = {}) {
    this.stepDelayMs = options.stepDelayMs ?? 120;
  }

  async getChannel(): Promise<ChannelInfo> {
    return {
      channelId: "mock-channel",
      channelTitle: "Mock channel (nothing is uploaded)",
    };
  }

  async uploadVideo(request: UploadRequest): Promise<UploadResult> {
    // Progress is reported in the same shape a real chunked upload reports it,
    // so the UI is exercised rather than merely rendered.
    for (const percent of [20, 40, 60, 80, 100]) {
      request.signal?.throwIfAborted();
      await this.pause();
      await request.onProgress(percent);
    }

    const videoId = `mock-${randomUUID()}`;

    return {
      videoId,
      videoUrl: `https://example.invalid/mock-upload/${videoId}`,
      publishedAt: new Date().toISOString(),
      visibility: request.settings.visibility,
      uploadStatus: "processing",
    };
  }

  async getProcessingStatus(): Promise<ProcessingStatus> {
    await this.pause();
    return { state: "succeeded", detail: null };
  }

  async setThumbnail(): Promise<string | null> {
    return "No YouTube credentials are configured, so nothing was uploaded and no thumbnail was set.";
  }

  private pause(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.stepDelayMs));
  }
}
