import { clampMetadata } from "@/server/ai/metadata-schema";
import type { MetadataPromptInput } from "@/server/ai/metadata-prompt";
import type {
  GeneratedMetadataField,
  GeneratedVideoMetadata,
  MetadataGenerator,
} from "@/server/ai/metadata-generator";
import type { MetadataField, VideoMetadata } from "@/types/metadata";

export const MOCK_MODEL_ID = "mock";

/**
 * Used when no AI_API_KEY is configured, so the metadata editor can be
 * exercised without credentials.
 *
 * The structure is real — it is built from the lesson, so the Korean listed is
 * the Korean in the video — but the phrasing is formulaic, and every field a
 * creator reads says so. Nothing here should ever be published as written.
 */
export class MockMetadataGenerator implements MetadataGenerator {
  async generate(input: MetadataPromptInput): Promise<GeneratedVideoMetadata> {
    const { lesson, format } = input;
    const short = format === "shorts";

    const content = clampMetadata({
      title: short
        ? `${lesson.title} 🇰🇷 (sample) #Shorts`
        : `${lesson.title} 🇰🇷 (sample) | Korean for ${input.level === "beginner" ? "Beginners" : "Learners"}`,
      description: [
        "Sample description from the mock generator — no AI key is configured, so this was not written for your video.",
        "",
        lesson.learning_objective,
        "",
        ...lesson.sections.map(
          (section) =>
            `${section.korean} — ${section.romanization} — ${section.translation}`,
        ),
        "",
        "Set AI_API_KEY in .env.local and regenerate to get a real description.",
      ].join("\n"),
      hashtags: ["#SampleMetadata", "#Korean", "#LearnKorean"],
      tags: [
        "sample metadata",
        "learn korean",
        "korean lesson",
        ...lesson.sections.slice(0, 5).map((section) => section.translation),
      ],
      thumbnailText: "SAMPLE",
      pinnedComment: `Sample pinned comment — mock output, not written for this lesson. Which of these did you already know: ${lesson.sections
        .slice(0, 2)
        .map((section) => section.korean)
        .join(", ")}?`,
    });

    return { content, model: MOCK_MODEL_ID };
  }

  async generateField(
    input: MetadataPromptInput,
    field: MetadataField,
    current: VideoMetadata,
  ): Promise<GeneratedMetadataField> {
    const fresh = await this.generate(input);

    // Marked so a regenerated field is visibly mock too, rather than looking
    // like the one real value on the page.
    const value = fresh.content[field];
    const marked =
      typeof value === "string"
        ? withSampleMarker(value, current[field] as string)
        : value;

    return { field, value: marked, model: MOCK_MODEL_ID };
  }
}

/** Keeps a regenerated string different from the one it replaced. */
function withSampleMarker(value: string, previous: string): string {
  return value === previous ? `${value} (regenerated sample)` : value;
}
