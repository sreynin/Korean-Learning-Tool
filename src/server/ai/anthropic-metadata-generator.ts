import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AppError } from "@/server/errors";
import { stopReasonError, toAppError } from "@/server/ai/anthropic-errors";
import {
  clampMetadata,
  generatedFieldSchemas,
  generatedMetadataSchema,
} from "@/server/ai/metadata-schema";
import {
  METADATA_SYSTEM_PROMPT,
  buildFieldPrompt,
  buildMetadataPrompt,
} from "@/server/ai/metadata-prompt";
import type { MetadataPromptInput } from "@/server/ai/metadata-prompt";
import type {
  GeneratedMetadataField,
  GeneratedVideoMetadata,
  MetadataGenerator,
} from "@/server/ai/metadata-generator";
import type { MetadataField, VideoMetadata } from "@/types/metadata";

const MAX_TOKENS = 4000;

export class AnthropicMetadataGenerator implements MetadataGenerator {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options: { apiKey: string; model: string }) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.model = options.model;
  }

  async generate(input: MetadataPromptInput): Promise<GeneratedVideoMetadata> {
    const response = await this.parse(
      buildMetadataPrompt(input),
      generatedMetadataSchema,
    );

    return {
      content: clampMetadata(response.parsed),
      model: response.model,
    };
  }

  async generateField(
    input: MetadataPromptInput,
    field: MetadataField,
    current: VideoMetadata,
  ): Promise<GeneratedMetadataField> {
    const response = await this.parse(
      buildFieldPrompt(input, field, current),
      generatedFieldSchemas[field],
    );

    // Clamped as part of a whole document so one field cannot skip the limits
    // the others are held to.
    const clamped = clampMetadata({ ...current, ...response.parsed });

    return { field, value: clamped[field], model: response.model };
  }

  private async parse<Schema extends z.ZodType>(
    prompt: string,
    schema: Schema,
  ): Promise<{ parsed: z.infer<Schema>; model: string }> {
    let response;

    try {
      response = await this.client.messages.parse({
        model: this.model,
        max_tokens: MAX_TOKENS,
        // Identical on every request, so it caches.
        system: [
          {
            type: "text",
            text: METADATA_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: prompt }],
        output_config: { format: zodOutputFormat(schema) },
      });
    } catch (error) {
      throw toAppError(error, "Metadata generation");
    }

    const stopError = stopReasonError(response.stop_reason, "metadata");
    if (stopError) throw stopError;

    if (!response.parsed_output) {
      throw new AppError(
        "generation_failed",
        "The model returned metadata that did not match the expected format.",
        502,
      );
    }

    return {
      parsed: response.parsed_output,
      model: response.model ?? this.model,
    };
  }
}
