import { producesLongForm, producesShorts } from "@/types/project";
import type { VideoFormat } from "@/types/project";
import type { RenderFormat } from "@/types/render";

/**
 * YouTube publishing metadata.
 *
 * Stored per cut rather than per project: a Short and a long-form video of the
 * same lesson want different titles and different descriptions, so a `both`
 * project carries one document for each. `MetadataFormat` is `RenderFormat` —
 * the same two cuts, named once.
 */
export type MetadataFormat = RenderFormat;

export interface VideoMetadata {
  title: string;
  description: string;
  /** Written with the leading `#`, e.g. `#LearnKorean`. */
  hashtags: string[];
  /** Plain keywords, no `#`. */
  tags: string[];
  /** Short line to overlay on the thumbnail image. */
  thumbnailText: string;
  /** A comment the creator can pin under the video. */
  pinnedComment: string;
}

/** The fields, in display order. Each one can be regenerated on its own. */
export const METADATA_FIELDS = [
  "title",
  "description",
  "hashtags",
  "tags",
  "thumbnailText",
  "pinnedComment",
] as const;
export type MetadataField = (typeof METADATA_FIELDS)[number];

/**
 * YouTube's own limits, except `thumbnailText`, which is a legibility limit:
 * text longer than this is unreadable at the size a thumbnail is shown.
 */
export const METADATA_LIMITS = {
  title: 100,
  description: 5000,
  thumbnailText: 30,
  pinnedComment: 500,
  hashtag: 40,
  tag: 60,
  /** YouTube counts the tag list as one 500-character field. */
  tagsTotal: 500,
} as const;

export const MAX_HASHTAGS = 6;
export const MAX_TAGS = 15;

/** How a cut's metadata is stored — content wrapped with its provenance. */
export interface StoredMetadata {
  format: MetadataFormat;
  content: VideoMetadata;
  /** ISO 8601 */
  generatedAt: string;
  /** Model id, or "mock". */
  model: string;
  /** ISO 8601, set when a human edits it. */
  editedAt: string | null;
}

/** Which cuts a project needs metadata for. */
export function metadataFormats(format: VideoFormat): MetadataFormat[] {
  return [
    ...(producesShorts(format) ? (["shorts"] as const) : []),
    ...(producesLongForm(format) ? (["long"] as const) : []),
  ];
}

export function metadataFor(
  metadata: StoredMetadata[],
  format: MetadataFormat,
): StoredMetadata | null {
  return metadata.find((entry) => entry.format === format) ?? null;
}

/** Total characters YouTube counts against the 500-character tag budget. */
export function tagsLength(tags: string[]): number {
  return tags.join(",").length;
}
