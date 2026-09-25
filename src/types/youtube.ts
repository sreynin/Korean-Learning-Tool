import type { RenderFormat } from "@/types/render";

/**
 * YouTube publishing.
 *
 * An upload is the same shape of problem as a render: minutes long, needs real
 * progress, and must outlive the request that starts it. So it uses the same
 * model — a job row is the contract, a queue executes it, and the route
 * returns as soon as the row exists.
 *
 * Nothing here ever carries an OAuth token. Tokens live encrypted in one table
 * that only `src/server/youtube/token-store.ts` reads; what reaches the
 * browser is the channel a creator connected, never the credential.
 */

/** Which cut is being published. Same two cuts as a render. */
export type PublishFormat = RenderFormat;

/**
 * Who can see the video on YouTube.
 *
 * `private` is the default everywhere in this app. An upload is hard to take
 * back once it is public, so the safe value is the one you get by not
 * choosing.
 */
export const YOUTUBE_VISIBILITIES = ["private", "unlisted", "public"] as const;
export type YouTubeVisibility = (typeof YOUTUBE_VISIBILITIES)[number];

export const DEFAULT_VISIBILITY: YouTubeVisibility = "private";

/**
 * Publish job states.
 *
 * `uploading` and `processing` are separate because they fail for different
 * reasons and the creator can do different things about them: an upload that
 * stalls is worth retrying, while YouTube rejecting a video during processing
 * is not. They are also the two waits long enough to need their own label.
 */
export const PUBLISH_STATUSES = [
  "pending",
  "queued",
  "uploading",
  "processing",
  "completed",
  "failed",
] as const;
export type PublishStatus = (typeof PUBLISH_STATUSES)[number];

/** Statuses that mean a job still owns the project's publish slot. */
export const ACTIVE_PUBLISH_STATUSES: PublishStatus[] = [
  "pending",
  "queued",
  "uploading",
  "processing",
];

export function isActivePublish(status: PublishStatus): boolean {
  return ACTIVE_PUBLISH_STATUSES.includes(status);
}

export function isPublishFinished(status: PublishStatus): boolean {
  return status === "completed" || status === "failed";
}

/**
 * YouTube's own category ids, which are numbers on the API and never change.
 *
 * This is a curated subset rather than a live `videoCategories.list` call:
 * the full list is region-specific and mostly irrelevant to a language
 * channel, and a fixed list keeps the form usable offline. Education is the
 * default because that is what this tool produces.
 */
export const YOUTUBE_CATEGORIES = [
  { id: "27", label: "Education" },
  { id: "22", label: "People & Blogs" },
  { id: "24", label: "Entertainment" },
  { id: "26", label: "Howto & Style" },
  { id: "19", label: "Travel & Events" },
  { id: "1", label: "Film & Animation" },
  { id: "10", label: "Music" },
  { id: "23", label: "Comedy" },
  { id: "28", label: "Science & Technology" },
] as const;

export type YouTubeCategoryId = (typeof YOUTUBE_CATEGORIES)[number]["id"];

export const YOUTUBE_CATEGORY_IDS = YOUTUBE_CATEGORIES.map(
  (category) => category.id,
) as unknown as readonly YouTubeCategoryId[];

export const DEFAULT_CATEGORY_ID: YouTubeCategoryId = "27";

/**
 * BCP-47 codes YouTube accepts for `defaultLanguage`.
 *
 * Deliberately the languages this app teaches in, plus Korean itself — the
 * spoken audio of a Korean lesson explained in English is English, and
 * `defaultAudioLanguage` is what YouTube uses to offer translations.
 */
export const YOUTUBE_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
] as const;

export type YouTubeLanguageCode = (typeof YOUTUBE_LANGUAGES)[number]["code"];

export const YOUTUBE_LANGUAGE_CODES = YOUTUBE_LANGUAGES.map(
  (language) => language.code,
) as unknown as readonly YouTubeLanguageCode[];

export const DEFAULT_LANGUAGE_CODE: YouTubeLanguageCode = "en";

/**
 * Where the video's thumbnail comes from.
 *
 * `render_poster` uses the still the renderer already took from the finished
 * video. There is no custom-image option because this app has no image upload
 * and no asset generation yet — offering one would be a field that cannot be
 * filled. `none` leaves YouTube to pick its own frame.
 *
 * Setting any custom thumbnail requires a **verified** YouTube channel.
 * An unverified channel gets a 403 from YouTube, which the job reports as a
 * warning rather than a failure: the video is already uploaded by then, and
 * losing it over a thumbnail would be worse.
 */
export const THUMBNAIL_SOURCES = ["render_poster", "none"] as const;
export type ThumbnailSource = (typeof THUMBNAIL_SOURCES)[number];

/** YouTube's limits on the fields this form submits. */
export const YOUTUBE_LIMITS = {
  title: 100,
  description: 5000,
  tag: 100,
  /** YouTube counts the whole tag list against one budget. */
  tagsTotal: 500,
  maxTags: 30,
} as const;

/** What the creator filled in on the publish form. */
export interface PublishSettings {
  title: string;
  description: string;
  tags: string[];
  visibility: YouTubeVisibility;
  categoryId: string;
  language: string;
  thumbnail: ThumbnailSource;
}

/**
 * What YouTube gave back once a video exists.
 *
 * Recorded on the job that produced it, so a second publish of the same
 * project cannot overwrite the record of the first — re-uploading creates a
 * genuinely different video with a different id.
 */
export interface Publication {
  videoId: string;
  videoUrl: string;
  /** ISO 8601 — when YouTube says the video was published. */
  publishedAt: string;
  visibility: YouTubeVisibility;
  projectId: string;
}

export interface PublishJob {
  id: string;
  projectId: string;
  format: PublishFormat;
  status: PublishStatus;
  /** 0-100, across the upload. Processing reports no percentage of its own. */
  progress: number;
  errorMessage: string | null;
  /**
   * Something that went wrong but did not stop the publish — a thumbnail an
   * unverified channel was not allowed to set, for instance.
   */
  warningMessage: string | null;
  settings: PublishSettings;
  /** Null until YouTube has accepted the upload. */
  publication: Publication | null;
  /** Which provider ran it: "youtube", or "mock" when none is configured. */
  provider: string;
  /** ISO 8601 */
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

/**
 * A connected YouTube channel, as the browser is allowed to see it.
 *
 * There is no token field, and there never should be: this type is returned
 * by an API route.
 */
export interface YouTubeConnection {
  channelId: string;
  channelTitle: string;
  /** ISO 8601 */
  connectedAt: string;
  /** Scopes the creator actually granted, so the UI can explain a gap. */
  scopes: string[];
}

/** Human labels for the job states, for one consistent wording everywhere. */
export const PUBLISH_STATUS_LABELS: Record<PublishStatus, string> = {
  pending: "Waiting",
  queued: "Waiting",
  uploading: "Uploading…",
  processing: "Processing…",
  completed: "Published",
  failed: "Failed",
};

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
