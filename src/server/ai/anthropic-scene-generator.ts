import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AppError } from "@/server/errors";
import { stopReasonError, toAppError } from "@/server/ai/anthropic-errors";
import { generatedStoryboardSchema } from "@/server/ai/scene-schema";
import { SCENE_SYSTEM_PROMPT, buildScenePrompt } from "@/server/ai/scene-prompt";
import type { ScenePromptInput } from "@/server/ai/scene-prompt";
import type {
  GeneratedStoryboard,
  SceneGenerator,
} from "@/server/ai/scene-generator";

const MAX_TOKENS = 16000;

export class AnthropicSceneGenerator implements SceneGenerator {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options: { apiKey: string; model: string }) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.model = options.model;
  }

  async generate(input: ScenePromptInput): Promise<GeneratedStoryboard> {
    let response;

    try {
      response = await this.client.messages.parse({
        model: this.model,
        max_tokens: MAX_TOKENS,
        // The system prompt is identical on every request, so it caches.
        system: [
          {
            type: "text",
            text: SCENE_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: buildScenePrompt(input) }],
        output_config: { format: zodOutputFormat(generatedStoryboardSchema) },
      });
    } catch (error) {
      throw toAppError(error, "Scene generation");
    }

    const stopError = stopReasonError(response.stop_reason, "storyboard");
    if (stopError) throw stopError;

    if (!response.parsed_output) {
      throw new AppError(
        "generation_failed",
        "The model returned a storyboard that did not match the expected format.",
        502,
      );
    }

    if (response.parsed_output.scenes.length === 0) {
      throw new AppError(
        "generation_failed",
        "The model returned an empty storyboard. Try regenerating.",
        502,
      );
    }

    return {
      scenes: response.parsed_output.scenes,
      model: response.model ?? this.model,
    };
  }
}
