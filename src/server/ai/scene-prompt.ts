import { VISUAL_STYLE_META } from "@/lib/constants";
import type { Lesson } from "@/types/lesson";
import type { VideoFormat, VisualStyle } from "@/types/project";

/**
 * Stable across every request, so it sits first and can be cached. Anything
 * request-specific belongs in the user message.
 */
export const SCENE_SYSTEM_PROMPT = `You are a video editor who turns Korean-language lessons into storyboards for educational videos. You decide what appears on screen, what the narrator says, and how long each shot lasts.

Non-negotiable rules:

1. COVER THE LESSON. Every section in the lesson must appear in at least one scene. Never drop content, never invent Korean that is not in the lesson, and never alter the Korean, romanization, or translation you are given — copy those fields exactly.

2. ONE IDEA PER SCENE. A scene shows a single word, pattern, sentence, or question. If a section teaches two things, split it into two scenes.

3. STRUCTURE.
   - The first scene is always type "hook" and uses the lesson's hook as its narration.
   - The last scene is always type "outro".
   - Each quiz question becomes a "quiz" scene immediately followed by an "answer" scene.
   - Use "vocabulary" or "grammar" to introduce an item, "example" to show it in a sentence, "explanation" for the why, and "practice" for a repeat-after-me beat.

4. ON-SCREEN TEXT IS NOT NARRATION. "koreanText", "englishText", and "romanization" are what the viewer reads — short, often a single word or phrase. "narration" is the full sentence the voice-over speaks. They are never the same string. Leave a text field as an empty string when that scene shows nothing of that kind; a hook usually has no Korean on screen.

5. NARRATION PACING. Narration must be speakable within the scene's duration at a natural pace — roughly 3 English words or 2 Korean syllables per second. If narration does not fit, shorten the narration or lengthen the scene.

6. DURATION BUDGET. The scene durations must sum to exactly the target total you are given. Give more time to new Korean and to quiz questions, less to transitions and the outro. Never pad with filler scenes to reach the total — adjust the durations of real scenes instead.

7. VISUAL PROMPTS. "visualPrompt" is an image-generation prompt for what fills the screen behind the text. Be concrete and describe a scene, not an abstraction. No text, letters, or words in the image — on-screen text is added separately. "background" is a two-to-four word label for the same thing.

8. MOTION. "animation" is how this scene's content appears; "transition" is how the scene enters from the previous one. Vary them enough to avoid monotony, but keep the first scene's transition "cut". Prefer restraint: most scenes should use simple animations.`;

export interface ScenePromptInput {
  lesson: Lesson;
  videoFormat: VideoFormat;
  visualStyle: VisualStyle;
  /** Seconds the storyboard must add up to. */
  targetDurationSeconds: number;
}

export function buildScenePrompt(input: ScenePromptInput): string {
  const { lesson, targetDurationSeconds, visualStyle, videoFormat } = input;

  return `Turn this lesson into a storyboard.

Target total duration: ${targetDurationSeconds} seconds. The scene durations MUST sum to exactly this number.
Video format: ${formatBrief(videoFormat, targetDurationSeconds)}
Visual style: ${VISUAL_STYLE_META[visualStyle].label} — ${VISUAL_STYLE_GUIDANCE[visualStyle]} Every "visualPrompt" must fit this style.

Lesson:
${JSON.stringify(lesson, null, 2)}

Copy the "korean", "romanization", and "translation" values from the lesson verbatim into "koreanText", "romanization", and "englishText". Write the narration yourself.`;
}

function formatBrief(videoFormat: VideoFormat, seconds: number): string {
  if (videoFormat === "shorts") {
    return `YouTube Short, vertical 9:16, ${seconds} seconds total. Move fast — the viewer decides in the first two seconds whether to stay. Keep scenes short and the scene count low.`;
  }

  if (videoFormat === "long") {
    return `Long-form YouTube video, horizontal 16:9, ${seconds} seconds total. There is room to breathe: add "explanation" and "practice" scenes between new items.`;
  }

  return `One storyboard that will be cut into both a Short and a long-form video, ${seconds} seconds total. Order the scenes so the hook plus the first few teaching scenes stand alone as a Short.`;
}

const VISUAL_STYLE_GUIDANCE: Record<VisualStyle, string> = {
  clean_educational:
    "flat, uncluttered backdrops with generous empty space for text overlays; calm, neutral colours.",
  korean_lifestyle:
    "real Korean settings — cafés, streets, convenience stores, subway platforms — shot like lifestyle photography.",
  cartoon:
    "friendly 2D illustration with bold outlines and saturated colour; simple characters and props.",
  minimal:
    "near-empty compositions, one subject, lots of negative space, restrained palette.",
  realistic:
    "photographic imagery with natural lighting and shallow depth of field.",
};
