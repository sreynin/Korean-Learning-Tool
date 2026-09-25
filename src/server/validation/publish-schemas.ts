import { z } from "zod";
import { RENDER_FORMATS } from "@/types/render";
import {
  THUMBNAIL_SOURCES,
  YOUTUBE_CATEGORY_IDS,
  YOUTUBE_LANGUAGE_CODES,
  YOUTUBE_LIMITS,
  YOUTUBE_VISIBILITIES,
} from "@/types/youtube";

/**
 * What the publish form is allowed to submit.
 *
 * The limits are YouTube's own. Validating them here rather than letting the
 * API reject the upload matters more than it looks: by the time YouTube
 * refuses a 101-character title, the creator has waited for an upload that was
 * never going to work.
 *
 * Nothing in this schema is optional with a silent default. Publishing is an
 * explicit act, so every field is something the creator saw and confirmed —
 * the form fills the defaults in where they can be read and changed.
 */
export const publishSettingsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "A title is required.")
    .max(YOUTUBE_LIMITS.title, `Titles are limited to ${YOUTUBE_LIMITS.title} characters.`)
    // YouTube rejects these outright rather than escaping them.
    .refine((value) => !value.includes("<") && !value.includes(">"), {
      message: "Titles cannot contain < or >.",
    }),
  description: z
    .string()
    .max(
      YOUTUBE_LIMITS.description,
      `Descriptions are limited to ${YOUTUBE_LIMITS.description} characters.`,
    ),
  tags: z
    .array(z.string().trim().min(1).max(YOUTUBE_LIMITS.tag))
    .max(YOUTUBE_LIMITS.maxTags, `Up to ${YOUTUBE_LIMITS.maxTags} tags.`)
    .refine(
      (tags) => tags.join(",").length <= YOUTUBE_LIMITS.tagsTotal,
      `All tags together must be under ${YOUTUBE_LIMITS.tagsTotal} characters.`,
    ),
  visibility: z.enum(YOUTUBE_VISIBILITIES),
  categoryId: z.enum(YOUTUBE_CATEGORY_IDS as [string, ...string[]]),
  language: z.enum(YOUTUBE_LANGUAGE_CODES as [string, ...string[]]),
  thumbnail: z.enum(THUMBNAIL_SOURCES),
});

export const startPublishSchema = publishSettingsSchema.extend({
  /** Which cut to publish. Required for a `both` project. */
  format: z.enum(RENDER_FORMATS).optional(),
  /**
   * The explicit confirmation that this is a publish.
   *
   * A settings object alone could be submitted by a mistimed retry or a
   * double-bound handler; this cannot be sent by accident. It is the
   * machine-readable half of "never publish without an explicit user action".
   */
  confirm: z.literal(true, {
    message: "Publishing has to be confirmed.",
  }),
});

export type StartPublishInput = z.infer<typeof startPublishSchema>;
