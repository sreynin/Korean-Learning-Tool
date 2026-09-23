import { getServerEnv } from "@/lib/env";
import { AnthropicLessonGenerator } from "@/server/ai/anthropic-lesson-generator";
import { MockLessonGenerator } from "@/server/ai/mock-lesson-generator";
import type { LessonGenerator } from "@/server/ai/lesson-generator";

/**
 * Single composition point for AI providers. Without an AI_API_KEY the app
 * falls back to the mock generator rather than failing, so the flow stays
 * usable before credentials are set up.
 */
const globalForAi = globalThis as unknown as {
  __lessonGenerator?: LessonGenerator;
};

export function getLessonGenerator(): LessonGenerator {
  if (!globalForAi.__lessonGenerator) {
    const env = getServerEnv();

    globalForAi.__lessonGenerator = env.AI_API_KEY
      ? new AnthropicLessonGenerator({
          apiKey: env.AI_API_KEY,
          model: env.AI_MODEL,
        })
      : new MockLessonGenerator();
  }

  return globalForAi.__lessonGenerator;
}

export type { LessonGenerator };
