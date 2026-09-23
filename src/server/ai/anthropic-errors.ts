import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "@/server/errors";

/** Maps SDK errors onto the app's error envelope without leaking internals. */
export function toAppError(error: unknown, what: string): AppError {
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

  // `AnthropicError` is the SDK's base class and `APIError` extends it, so
  // reaching here means a non-HTTP SDK failure — in practice, the model's
  // reply not matching the structured-output schema. That is an upstream
  // formatting problem, not a fault in this server, so it is a 502.
  if (error instanceof Anthropic.AnthropicError) {
    console.error("[ai] structured output error", error.message);
    return new AppError(
      "generation_failed",
      `${what} failed: the model returned a response that did not match the expected format.`,
      502,
    );
  }

  console.error("[ai] unexpected generation error", error);
  return new AppError(
    "generation_failed",
    `${what} failed unexpectedly.`,
    500,
  );
}

/**
 * Translates a non-`end_turn` stop reason into an `AppError`, or returns null
 * when the response completed normally.
 */
export function stopReasonError(
  stopReason: string | null,
  what: string,
): AppError | null {
  if (stopReason === "refusal") {
    return new AppError(
      "generation_failed",
      `The model declined to produce this ${what}. Try rewording the topic.`,
      422,
    );
  }

  if (stopReason === "max_tokens") {
    return new AppError(
      "generation_failed",
      `The ${what} was cut off before it finished. Try a narrower topic or a shorter format.`,
      502,
    );
  }

  return null;
}
