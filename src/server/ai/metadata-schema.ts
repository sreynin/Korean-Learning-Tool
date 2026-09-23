import { z } from "zod";
import {
  MAX_HASHTAGS,
  MAX_TAGS,
  METADATA_LIMITS,
  tagsLength,
} from "@/types/metadata";
import type { MetadataField } from "@/types/metadata";

/**
 * Two schemas, as elsewhere in this codebase: a permissive one the model
 * writes into, and a strict one a human save must satisfy. Metadata the
 * creator can trim beats a generation rejected for two characters.
 */
export const generatedMetadataSchema = z.object({
  title: z.string(),
  description: z.string(),
  hashtags: z.array(z.string()),
  tags: z.array(z.string()),
  thumbnailText: z.string(),
  pinnedComment: z.string(),
});

export type GeneratedMetadata = z.infer<typeof generatedMetadataSchema>;

/** Per-field schemas, so regenerating one field asks for exactly that field. */
export const generatedFieldSchemas = {
  title: generatedMetadataSchema.pick({ title: true }),
  description: generatedMetadataSchema.pick({ description: true }),
  hashtags: generatedMetadataSchema.pick({ hashtags: true }),
  tags: generatedMetadataSchema.pick({ tags: true }),
  thumbnailText: generatedMetadataSchema.pick({ thumbnailText: true }),
  pinnedComment: generatedMetadataSchema.pick({ pinnedComment: true }),
} satisfies Record<MetadataField, z.ZodType>;

const hashtag = z
  .string()
  .trim()
  .min(2)
  .max(METADATA_LIMITS.hashtag)
  .regex(/^#[^\s#]+$/, "A hashtag must start with # and contain no spaces.");

const tag = z.string().trim().min(1).max(METADATA_LIMITS.tag);

export const metadataEditSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "A title is required.")
    .max(METADATA_LIMITS.title, `YouTube titles are limited to ${METADATA_LIMITS.title} characters.`),
  description: z
    .string()
    .trim()
    .max(METADATA_LIMITS.description, `Descriptions are limited to ${METADATA_LIMITS.description} characters.`),
  hashtags: z
    .array(hashtag)
    .max(MAX_HASHTAGS, `Use at most ${MAX_HASHTAGS} hashtags.`),
  tags: z
    .array(tag)
    .max(MAX_TAGS, `Use at most ${MAX_TAGS} tags.`)
    .refine(
      (values) => tagsLength(values) <= METADATA_LIMITS.tagsTotal,
      `All tags together are limited to ${METADATA_LIMITS.tagsTotal} characters.`,
    ),
  thumbnailText: z
    .string()
    .trim()
    .max(METADATA_LIMITS.thumbnailText, `Thumbnail text is limited to ${METADATA_LIMITS.thumbnailText} characters so it stays readable.`),
  pinnedComment: z
    .string()
    .trim()
    .max(METADATA_LIMITS.pinnedComment, `Pinned comments are limited to ${METADATA_LIMITS.pinnedComment} characters.`),
});

/**
 * Trims a generation into the strict shape.
 *
 * The model is asked for the limits but is not bound by them, so rather than
 * failing a whole generation over a long title or a malformed hashtag, the
 * value is cut to length and unusable entries are dropped. The creator edits
 * from something, not from an error.
 */
export function clampMetadata(generated: GeneratedMetadata) {
  return {
    title: cut(generated.title, METADATA_LIMITS.title),
    description: cut(generated.description, METADATA_LIMITS.description),
    hashtags: generated.hashtags
      .map((value) => normalizeHashtag(value))
      .filter((value) => hashtag.safeParse(value).success)
      .slice(0, MAX_HASHTAGS),
    tags: limitTags(
      generated.tags
        .map((value) => value.trim().replace(/^#/, ""))
        .filter((value) => value.length > 0)
        .slice(0, MAX_TAGS),
    ),
    thumbnailText: cut(generated.thumbnailText, METADATA_LIMITS.thumbnailText),
    pinnedComment: cut(generated.pinnedComment, METADATA_LIMITS.pinnedComment),
  };
}

function cut(value: string, limit: number): string {
  return value.trim().slice(0, limit);
}

function normalizeHashtag(value: string): string {
  const bare = value.trim().replace(/^#+/, "").replace(/\s+/g, "");
  return bare ? `#${bare}`.slice(0, METADATA_LIMITS.hashtag) : "";
}

/** Drops tags from the end until the list fits YouTube's shared budget. */
function limitTags(tags: string[]): string[] {
  const kept: string[] = [];

  for (const value of tags) {
    if (tagsLength([...kept, value]) > METADATA_LIMITS.tagsTotal) break;
    kept.push(value);
  }

  return kept;
}
