import { z } from "zod";
import { jsonOk, parseJsonBody, route } from "@/server/http";
import { generateLesson } from "@/server/services/lesson-service";
import {
  CONTENT_STYLES,
  PROFICIENCY_LEVELS,
  TARGET_LANGUAGES,
  VIDEO_FORMATS,
} from "@/types/project";

/** Generation can take a while on long-form lessons. */
export const maxDuration = 300;

const generateLessonSchema = z.object({
  topic: z
    .string()
    .trim()
    .min(3, "Topic must be at least 3 characters.")
    .max(200, "Topic must be 200 characters or fewer."),
  level: z.enum(PROFICIENCY_LEVELS),
  videoType: z.enum(VIDEO_FORMATS),
  language: z.enum(TARGET_LANGUAGES),
  style: z.enum(CONTENT_STYLES),
});

export const POST = route(async (request: Request) => {
  const input = await parseJsonBody(request, generateLessonSchema);
  const { lesson, model } = await generateLesson(input);

  return jsonOk({ lesson, model });
});
