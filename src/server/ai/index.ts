import { getServerEnv } from "@/lib/env";
import { AnthropicLessonGenerator } from "@/server/ai/anthropic-lesson-generator";
import { AnthropicMetadataGenerator } from "@/server/ai/anthropic-metadata-generator";
import { AnthropicSceneGenerator } from "@/server/ai/anthropic-scene-generator";
import { MockLessonGenerator } from "@/server/ai/mock-lesson-generator";
import { MockMetadataGenerator } from "@/server/ai/mock-metadata-generator";
import { MockSceneGenerator } from "@/server/ai/mock-scene-generator";
import type { LessonGenerator } from "@/server/ai/lesson-generator";
import type { MetadataGenerator } from "@/server/ai/metadata-generator";
import type { SceneGenerator } from "@/server/ai/scene-generator";

/**
 * Single composition point for AI providers. Without an AI_API_KEY the app
 * falls back to the mock generators rather than failing, so the flow stays
 * usable before credentials are set up.
 */
const globalForAi = globalThis as unknown as {
  __lessonGenerator?: LessonGenerator;
  __sceneGenerator?: SceneGenerator;
  __metadataGenerator?: MetadataGenerator;
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

export function getSceneGenerator(): SceneGenerator {
  if (!globalForAi.__sceneGenerator) {
    const env = getServerEnv();

    globalForAi.__sceneGenerator = env.AI_API_KEY
      ? new AnthropicSceneGenerator({
          apiKey: env.AI_API_KEY,
          model: env.AI_MODEL,
        })
      : new MockSceneGenerator();
  }

  return globalForAi.__sceneGenerator;
}

export function getMetadataGenerator(): MetadataGenerator {
  if (!globalForAi.__metadataGenerator) {
    const env = getServerEnv();

    globalForAi.__metadataGenerator = env.AI_API_KEY
      ? new AnthropicMetadataGenerator({
          apiKey: env.AI_API_KEY,
          model: env.AI_MODEL,
        })
      : new MockMetadataGenerator();
  }

  return globalForAi.__metadataGenerator;
}

export type { LessonGenerator, MetadataGenerator, SceneGenerator };
