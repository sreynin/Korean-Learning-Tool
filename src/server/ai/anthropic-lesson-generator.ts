import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AppError } from "@/server/errors";
import { lessonSchema, reconcileQuizAnswers } from "@/server/ai/lesson-schema";
import { LESSON_SYSTEM_PROMPT, buildLessonPrompt } from "@/server/ai/prompt";
import type {
  GeneratedLesson,
  LessonGenerator,
} from "@/server/ai/lesson-generator";
import type { LessonGenerationRequest } from "@/types/lesson";

const MAX_TOKENS = 16000;

export class AnthropicLessonGenerator implements LessonGenerator {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options: { apiKey: string; model: string }) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.model = options.model;
  }

  async generate(request: LessonGenerationRequest): Promise<GeneratedLesson> {
    let response;

    try {
      response = await this.client.messages.parse({
        model: this.model,
        max_tokens: MAX_TOKENS,
        // The system prompt is identical on every request, so it caches.
        system: [
          {
            type: "text",
            text: LESSON_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: buildLessonPrompt(request) }],
        output_config: { format: zodOutputFormat(lessonSchema) },
      });
    } catch (error) {
      throw toAppError(error);
    }

    if (response.stop_reason === "refusal") {
      throw new AppError(
        "generation_failed",
        "The model declined to generate this lesson. Try rewording the topic.",
        422,
      );
    }

    if (response.stop_reason === "max_tokens") {
      throw new AppError(
        "generation_failed",
        "The lesson was cut off before it finished. Try a narrower topic or a shorter format.",
        502,
      );
    }

    if (!response.parsed_output) {
      throw new AppError(
        "generation_failed",
        "The model returned a lesson that did not match the expected format.",
        502,
      );
    }

    return {
      lesson: reconcileQuizAnswers(response.parsed_output),
      model: response.model ?? this.model,
    };
  }
}

/** Maps SDK errors onto the app's error envelope without leaking internals. */
function toAppError(error: unknown): AppError {
  if (error instanceof Anthropic.AuthenticationError) {
    return new AppError(
      "generation_failed",
      "The configured AI_API_KEY was rejected. Check it in .env.local.",
      502,
    );
  }

  if (error instanceof Anthropic.RateLimitError) {
    return new AppError(
      "generation_failed",
      "The AI provider is rate limiting requests. Wait a moment and try again.",
      429,
    );
  }

  if (error instanceof Anthropic.APIConnectionError) {
    return new AppError(
      "generation_failed",
      "Could not reach the AI provider. Check your connection and try again.",
      502,
    );
  }

  if (error instanceof Anthropic.APIError) {
    console.error("[ai] provider error", error.status, error.message);
    return new AppError(
      "generation_failed",
      "The AI provider returned an error. Try again in a moment.",
      502,
    );
  }

  console.error("[ai] unexpected generation error", error);
  return new AppError(
    "generation_failed",
    "Lesson generation failed unexpectedly.",
    500,
  );
}
