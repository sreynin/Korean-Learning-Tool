import type { MetadataPromptInput } from "@/server/ai/metadata-prompt";
import type { MetadataField, VideoMetadata } from "@/types/metadata";

export interface GeneratedVideoMetadata {
  content: VideoMetadata;
  /** Model id that produced it, or "mock" when no provider is configured. */
  model: string;
}

export interface GeneratedMetadataField {
  field: MetadataField;
  value: VideoMetadata[MetadataField];
  model: string;
}

/**
 * The boundary between the app and whichever model writes metadata.
 *
 * `generateField` exists because the creator regenerates one field at a time:
 * asking for the whole document and keeping one field would throw away five
 * good values and cost five times as much.
 */
export interface MetadataGenerator {
  generate(input: MetadataPromptInput): Promise<GeneratedVideoMetadata>;
  generateField(
    input: MetadataPromptInput,
    field: MetadataField,
    current: VideoMetadata,
  ): Promise<GeneratedMetadataField>;
}
