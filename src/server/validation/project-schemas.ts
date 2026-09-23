import { z } from "zod";
import {
  CONTENT_STYLES,
  LONG_DURATION_OPTIONS,
  PROFICIENCY_LEVELS,
  PROJECT_STATUSES,
  SHORTS_DURATION_OPTIONS,
  TARGET_LANGUAGES,
  VIDEO_FORMATS,
  VISUAL_STYLES,
  producesLongForm,
  producesShorts,
} from "@/types/project";
import type { VideoFormat } from "@/types/project";

const topic = z
  .string()
  .trim()
  .min(3, "Topic must be at least 3 characters.")
  .max(200, "Topic must be 200 characters or fewer.");

const title = z
  .string()
  .trim()
  .min(3, "Title must be at least 3 characters.")
  .max(120, "Title must be 120 characters or fewer.");

const description = z
  .string()
  .trim()
  .max(1000, "Description must be 1000 characters or fewer.");

const shortsDurationSeconds = z.literal(SHORTS_DURATION_OPTIONS, {
  error: "Choose one of the available Shorts lengths.",
});

const longDurationSeconds = z.literal(LONG_DURATION_OPTIONS, {
  error: "Choose one of the available long-form lengths.",
});

export const createProjectSchema = z
  .object({
    topic,
    title: title.optional(),
    description: description.optional(),
    format: z.enum(VIDEO_FORMATS, { error: "Choose a video type." }),
    level: z.enum(PROFICIENCY_LEVELS, { error: "Choose a learning level." }),
    targetLanguage: z.enum(TARGET_LANGUAGES, {
      error: "Choose a target language.",
    }),
    contentStyle: z.enum(CONTENT_STYLES, { error: "Choose a content style." }),
    visualStyle: z.enum(VISUAL_STYLES, { error: "Choose a visual style." }),
    shortsDurationSeconds: shortsDurationSeconds.optional(),
    longDurationSeconds: longDurationSeconds.optional(),
  })
  .superRefine(requireDurationsForFormat);

export const updateProjectSchema = z
  .object({
    title: title.optional(),
    topic: topic.optional(),
    description: description.optional(),
    format: z.enum(VIDEO_FORMATS).optional(),
    level: z.enum(PROFICIENCY_LEVELS).optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
    targetLanguage: z.enum(TARGET_LANGUAGES).optional(),
    contentStyle: z.enum(CONTENT_STYLES).optional(),
    visualStyle: z.enum(VISUAL_STYLES).optional(),
    shortsDurationSeconds: shortsDurationSeconds.optional(),
    longDurationSeconds: longDurationSeconds.optional(),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    "Provide at least one field to update.",
  );

export const projectListFiltersSchema = z.object({
  status: z.enum(PROJECT_STATUSES).optional(),
  format: z.enum(VIDEO_FORMATS).optional(),
  search: z.string().trim().max(200).optional(),
});

/**
 * A format only accepts the durations it actually produces: "shorts" needs a
 * Shorts length, "long" needs a long-form length, and "both" needs each.
 */
function requireDurationsForFormat(
  value: {
    format: VideoFormat;
    shortsDurationSeconds?: number;
    longDurationSeconds?: number;
  },
  ctx: z.RefinementCtx,
) {
  if (producesShorts(value.format) && value.shortsDurationSeconds === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["shortsDurationSeconds"],
      message: "Choose a length for the Short.",
    });
  }

  if (producesLongForm(value.format) && value.longDurationSeconds === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["longDurationSeconds"],
      message: "Choose a length for the long video.",
    });
  }
}
