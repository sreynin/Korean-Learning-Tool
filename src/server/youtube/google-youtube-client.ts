import { createReadStream } from "node:fs";
import { AppError, ConflictError } from "@/server/errors";
import { watchUrl } from "@/types/youtube";
import type { YouTubeVisibility } from "@/types/youtube";
import type {
  ChannelInfo,
  ProcessingState,
  ProcessingStatus,
  UploadRequest,
  UploadResult,
  YouTubeClient,
} from "@/server/youtube/youtube-client";
import { createLogger } from "@/server/logger";

const log = createLogger("youtube");

/**
 * YouTube Data API v3, over plain HTTP.
 *
 * The upload uses Google's **resumable** protocol rather than a single POST:
 * an initiating request returns a session URL, and the bytes follow in chunks.
 * That is what makes progress real — each chunk that lands is a number the
 * creator can watch — and it is the only supported way to send a file that may
 * be hundreds of megabytes.
 *
 * An access token is passed in per call rather than held on the instance. The
 * token can be refreshed between the upload and the processing poll, and an
 * instance that cached one would carry a stale credential into the second
 * request.
 */

const UPLOAD_ENDPOINT =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";
const VIDEOS_ENDPOINT = "https://www.googleapis.com/youtube/v3/videos";
const CHANNELS_ENDPOINT =
  "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true";
const THUMBNAIL_ENDPOINT =
  "https://www.googleapis.com/upload/youtube/v3/thumbnails/set";

/**
 * 8 MiB per chunk.
 *
 * Google requires a multiple of 256 KiB for every chunk but the last. Smaller
 * chunks give smoother progress but more round trips; this is large enough to
 * keep a long upload efficient and small enough that a 30-second Short still
 * reports progress more than once.
 */
const CHUNK_BYTES = 8 * 1024 * 1024;

export class GoogleYouTubeClient implements YouTubeClient {
  readonly name = "youtube";
  readonly uploadsForReal = true;

  /**
   * Supplies a valid access token, refreshing it if needed. A function rather
   * than a value so a long upload can start with a token that was about to
   * expire.
   */
  private readonly getAccessToken: () => Promise<string>;

  constructor(options: { getAccessToken: () => Promise<string> }) {
    this.getAccessToken = options.getAccessToken;
  }

  async getChannel(): Promise<ChannelInfo> {
    const token = await this.getAccessToken();
    const payload = await this.requestJson<{
      items?: Array<{ id: string; snippet?: { title?: string } }>;
    }>(CHANNELS_ENDPOINT, { headers: { Authorization: `Bearer ${token}` } });

    const channel = payload.items?.[0];

    if (!channel) {
      throw new ConflictError(
        "That Google account has no YouTube channel. Create one, then connect again.",
      );
    }

    return {
      channelId: channel.id,
      channelTitle: channel.snippet?.title ?? "Untitled channel",
    };
  }

  async uploadVideo(request: UploadRequest): Promise<UploadResult> {
    const { filePath, byteSize, settings, onProgress, signal } = request;
    const token = await this.getAccessToken();

    const sessionUrl = await this.startResumableSession(token, byteSize, settings);

    let uploaded = 0;
    let completed: VideoResource | null = null;

    while (uploaded < byteSize) {
      signal?.throwIfAborted();

      const end = Math.min(uploaded + CHUNK_BYTES, byteSize) - 1;
      const chunk = await readChunk(filePath, uploaded, end);

      const response = await this.sendChunk({
        sessionUrl,
        chunk,
        start: uploaded,
        end,
        total: byteSize,
        signal,
      });

      if (response.done) {
        completed = response.video;
        uploaded = byteSize;
      } else {
        // Google reports how much it actually kept, which can be less than
        // what was sent. Trusting our own count would silently corrupt the
        // file by resuming from the wrong offset.
        uploaded = response.receivedBytes ?? uploaded + chunk.length;
      }

      await onProgress((uploaded / byteSize) * 100);
    }

    if (!completed) {
      throw new AppError(
        "generation_failed",
        "YouTube accepted every chunk but never confirmed the video. Check your channel before retrying, so you do not upload it twice.",
        502,
      );
    }

    return {
      videoId: completed.id,
      videoUrl: watchUrl(completed.id),
      publishedAt: completed.snippet?.publishedAt ?? new Date().toISOString(),
      visibility: (completed.status?.privacyStatus ??
        settings.visibility) as YouTubeVisibility,
      uploadStatus: toProcessingState(completed.status?.uploadStatus),
    };
  }

  async getProcessingStatus(videoId: string): Promise<ProcessingStatus> {
    const token = await this.getAccessToken();
    const url = `${VIDEOS_ENDPOINT}?part=status,processingDetails&id=${encodeURIComponent(videoId)}`;

    const payload = await this.requestJson<{ items?: VideoResource[] }>(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const video = payload.items?.[0];

    if (!video) {
      return { state: "unknown", detail: "YouTube did not return the video." };
    }

    const state = toProcessingState(video.status?.uploadStatus);
    const detail =
      video.status?.rejectionReason ??
      video.status?.failureReason ??
      video.processingDetails?.processingFailureReason ??
      null;

    return { state, detail };
  }

  async setThumbnail(videoId: string, filePath: string): Promise<string | null> {
    const token = await this.getAccessToken();
    const body = await readChunk(filePath, 0, Infinity);

    let response: Response;
    try {
      response = await fetch(
        `${THUMBNAIL_ENDPOINT}?videoId=${encodeURIComponent(videoId)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "image/jpeg",
          },
          body: new Uint8Array(body),
        },
      );
    } catch (error) {
      log.error("thumbnail upload failed", error);
      return "The video uploaded, but the thumbnail could not be sent. Set it on YouTube.";
    }

    if (response.ok) return null;

    // 403 here almost always means the channel is not verified, which is a
    // YouTube account setting and not something this app can fix.
    if (response.status === 403) {
      return "The video uploaded, but YouTube would not accept a custom thumbnail. Channels must be verified before they can set one.";
    }

    log.error("thumbnail rejected", { status: response.status });
    return `The video uploaded, but YouTube rejected the thumbnail (HTTP ${response.status}). Set it on YouTube.`;
  }

  /** Opens the upload session and returns the URL the bytes go to. */
  private async startResumableSession(
    token: string,
    byteSize: number,
    settings: PublishSettingsLike,
  ): Promise<string> {
    let response: Response;

    try {
      response = await fetch(UPLOAD_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Length": String(byteSize),
          "X-Upload-Content-Type": "video/mp4",
        },
        body: JSON.stringify({
          snippet: {
            title: settings.title,
            description: settings.description,
            tags: settings.tags,
            categoryId: settings.categoryId,
            defaultLanguage: settings.language,
            defaultAudioLanguage: settings.language,
          },
          status: {
            privacyStatus: settings.visibility,
            // Videos made by this tool are not made for kids, and YouTube
            // requires the declaration on every upload.
            selfDeclaredMadeForKids: false,
          },
        }),
      });
    } catch (error) {
      log.error("could not open upload session", error);
      throw new AppError(
        "generation_failed",
        "Could not reach YouTube to start the upload.",
        502,
      );
    }

    if (!response.ok) {
      throw await toUploadError(response, "start the upload");
    }

    const sessionUrl = response.headers.get("location");

    if (!sessionUrl) {
      throw new AppError(
        "generation_failed",
        "YouTube accepted the request but did not return an upload session.",
        502,
      );
    }

    return sessionUrl;
  }

  private async sendChunk(options: {
    sessionUrl: string;
    chunk: Buffer;
    start: number;
    end: number;
    total: number;
    signal?: AbortSignal;
  }): Promise<
    { done: true; video: VideoResource } | { done: false; receivedBytes: number | null }
  > {
    const { sessionUrl, chunk, start, end, total, signal } = options;

    let response: Response;
    try {
      response = await fetch(sessionUrl, {
        method: "PUT",
        headers: {
          "Content-Length": String(chunk.length),
          "Content-Range": `bytes ${start}-${end}/${total}`,
        },
        body: new Uint8Array(chunk),
        signal,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      log.error("chunk upload failed", error);
      throw new AppError(
        "generation_failed",
        "The connection to YouTube dropped during the upload.",
        502,
      );
    }

    // 308 is Google's "keep going", and carries how far it has got.
    if (response.status === 308) {
      return { done: false, receivedBytes: parseRangeEnd(response.headers.get("range")) };
    }

    if (response.ok) {
      const video = (await response.json()) as VideoResource;
      return { done: true, video };
    }

    throw await toUploadError(response, "upload the video");
  }

  private async requestJson<T>(url: string, init: RequestInit): Promise<T> {
    let response: Response;

    try {
      response = await fetch(url, init);
    } catch (error) {
      log.error("request failed", error);
      throw new AppError(
        "generation_failed",
        "Could not reach YouTube. Check your connection and try again.",
        502,
      );
    }

    if (!response.ok) {
      throw await toUploadError(response, "talk to YouTube");
    }

    return (await response.json()) as T;
  }
}

interface PublishSettingsLike {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  language: string;
  visibility: string;
}

interface VideoResource {
  id: string;
  snippet?: { publishedAt?: string };
  status?: {
    uploadStatus?: string;
    privacyStatus?: string;
    rejectionReason?: string;
    failureReason?: string;
  };
  processingDetails?: { processingFailureReason?: string };
}

/**
 * Turns an API failure into something the creator can act on.
 *
 * The quota case is called out because it is both common and completely
 * opaque otherwise: the default YouTube upload quota is small enough that a
 * handful of videos a day exhausts it, and "try again tomorrow" is the only
 * real advice.
 */
async function toUploadError(response: Response, action: string): Promise<AppError> {
  const body = await response.text().catch(() => "");
  log.error(`failed to ${action}`, { status: response.status, body: body.slice(0, 500) });

  if (response.status === 401) {
    return new ConflictError(
      "YouTube rejected the stored credentials. Reconnect the account and try again.",
    );
  }

  if (response.status === 403 && body.includes("quotaExceeded")) {
    return new ConflictError(
      "This channel has used its YouTube upload quota for today. Try again tomorrow.",
    );
  }

  if (response.status === 403) {
    return new ConflictError(
      "YouTube refused the upload for this channel. Check that it can upload videos of this length and that it is in good standing.",
    );
  }

  return new AppError(
    "generation_failed",
    `YouTube could not ${action} (HTTP ${response.status}).`,
    502,
  );
}

function toProcessingState(uploadStatus: string | undefined): ProcessingState {
  switch (uploadStatus) {
    case "processed":
      return "succeeded";
    case "uploaded":
      return "processing";
    case "rejected":
      return "rejected";
    case "failed":
      return "failed";
    default:
      return "unknown";
  }
}

/** `bytes=0-8388607` → 8388608, the offset to resume from. */
function parseRangeEnd(range: string | null): number | null {
  if (!range) return null;
  const match = /bytes=\d+-(\d+)/.exec(range);
  return match ? Number(match[1]) + 1 : null;
}

/** Reads one slice of the file without loading the whole thing into memory. */
async function readChunk(
  filePath: string,
  start: number,
  end: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const piece of createReadStream(filePath, { start, end })) {
    chunks.push(piece as Buffer);
  }

  return Buffer.concat(chunks);
}
