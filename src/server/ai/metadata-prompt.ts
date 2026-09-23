import { LEVEL_META } from "@/lib/constants";
import { MAX_HASHTAGS, MAX_TAGS, METADATA_LIMITS } from "@/types/metadata";
import type { MetadataField, MetadataFormat, VideoMetadata } from "@/types/metadata";
import type { Lesson } from "@/types/lesson";
import type { ProficiencyLevel } from "@/types/project";

/**
 * Stable across every request, so it sits first and can be cached. Anything
 * request-specific belongs in the user message.
 */
export const METADATA_SYSTEM_PROMPT = `You write YouTube metadata for a channel that teaches Korean. You are given the lesson that is actually in the video, and you describe that lesson accurately.

Non-negotiable rules:

1. DESCRIBE THE REAL VIDEO. Every field must match the lesson you are given. Never promise vocabulary, grammar, or topics the lesson does not cover, and never imply the video is longer, more advanced, or more comprehensive than it is.

2. NO PERFORMANCE CLAIMS. Never mention views, subscribers, virality, trending, or the algorithm, and never suggest the video or the viewer will achieve any particular result. No "go viral", no "guaranteed", no "the algorithm loves this", no "you will be fluent in a week". Write for a reader, not for a ranking.

3. NO CLICKBAIT THAT THE VIDEO DOES NOT HONOUR. Curiosity is fine; a promise the lesson does not keep is not. Do not use fake urgency, fake scarcity, or all-caps shouting.

4. TITLE. At most ${METADATA_LIMITS.title} characters, and shorter is better. Lead with what the viewer learns. A single flag or relevant emoji is welcome; a row of them is not.

5. DESCRIPTION. Open with one or two sentences saying what the video teaches, in the viewer's own language. Then list the actual Korean covered, one item per line, as "Korean — romanization — English", copying those values from the lesson exactly. Close with a short line inviting a comment or a follow. Plain text only: no markdown, no headings.

6. HASHTAGS. At most ${MAX_HASHTAGS}, each starting with # and containing no spaces. They belong to the subject — the language, the level, the topic. YouTube shows the first three above the title, so put the most relevant first.

7. TAGS. At most ${MAX_TAGS} plain keywords with no # and no quotes, together under ${METADATA_LIMITS.tagsTotal} characters. Mix broad terms a learner would search for with the specific Korean in this lesson. Never repeat the same phrase with trivial variations.

8. THUMBNAIL TEXT. At most ${METADATA_LIMITS.thumbnailText} characters — two or three large words that stay readable on a phone. It is a label on an image, not a sentence, and it must not repeat the title word for word.

9. PINNED COMMENT. One short paragraph the creator can pin: recap the single most useful thing in the lesson, then ask one genuine question that a learner can answer from what they just watched. No links, no requests to subscribe.

10. KOREAN IS COPIED, NEVER INVENTED. Any Korean you write must appear in the lesson, with its romanization and translation unchanged.`;

export interface MetadataPromptInput {
  lesson: Lesson;
  format: MetadataFormat;
  level: ProficiencyLevel;
  /** The audience's language, as a human label, e.g. "English". */
  language: string;
  durationSeconds: number;
}

export function buildMetadataPrompt(input: MetadataPromptInput): string {
  return `Write the YouTube metadata for this video.

${videoBrief(input)}

Lesson:
${JSON.stringify(input.lesson, null, 2)}`;
}

/**
 * The prompt for regenerating a single field.
 *
 * The other fields are supplied as context so the new value fits the ones the
 * creator is keeping — a fresh title that contradicts the description would
 * be worse than the one being replaced.
 */
export function buildFieldPrompt(
  input: MetadataPromptInput,
  field: MetadataField,
  current: VideoMetadata,
): string {
  const { [field]: replaced, ...keeping } = current;

  return `Write a new "${field}" for this video. Return only that field.

${videoBrief(input)}

The current value, which the creator wants replaced — do not repeat it:
${JSON.stringify(replaced)}

The rest of the metadata, which is staying as it is. Your new "${field}" must sit naturally alongside it:
${JSON.stringify(keeping, null, 2)}

Lesson:
${JSON.stringify(input.lesson, null, 2)}`;
}

function videoBrief(input: MetadataPromptInput): string {
  const level = LEVEL_META[input.level].label;

  return `Format: ${FORMAT_GUIDANCE[input.format]}
Length: about ${input.durationSeconds} seconds.
Audience: ${level} learners whose language is ${input.language}.`;
}

const FORMAT_GUIDANCE: Record<MetadataFormat, string> = {
  shorts: `YouTube Short, vertical, under a minute. The title must be short enough to read at a glance and must end with "#Shorts". Something like "Learn Korean Numbers 1-5 🇰🇷 #Shorts". Keep the description to a few lines — a Shorts viewer rarely opens it. The thumbnail text matters less than for long form, but still write one.`,
  long: `Full-length YouTube video, horizontal. The title should be descriptive and searchable, with a subtitle after a pipe, like "Learn Korean Numbers 1-10 🇰🇷 | Korean for Beginners". Never add "#Shorts". Write a fuller description: what the video covers, then the list of Korean, then the closing line.`,
};
