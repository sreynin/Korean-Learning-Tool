import { MAX_SCENE_DURATION, MIN_SCENE_DURATION } from "@/types/scene";
import type { GeneratedScene, SceneAnimation } from "@/types/scene";
import type { ScenePromptInput } from "@/server/ai/scene-prompt";
import type {
  GeneratedStoryboard,
  SceneGenerator,
} from "@/server/ai/scene-generator";
import { producesLongForm } from "@/types/project";

export const MOCK_MODEL_ID = "mock";

/**
 * Used when no AI_API_KEY is configured, so the storyboard editor can be
 * exercised without credentials.
 *
 * Unlike the mock lesson, this derives real structure from the lesson it is
 * given — the shape is genuine, only the narration phrasing and visual prompts
 * are formulaic. The panel labels it as mock via `model`.
 */
export class MockSceneGenerator implements SceneGenerator {
  async generate(input: ScenePromptInput): Promise<GeneratedStoryboard> {
    const { lesson, targetDurationSeconds } = input;
    const detailed = producesLongForm(input.videoFormat);

    const drafts: Draft[] = [
      {
        weight: 2,
        scene: {
          type: "hook",
          koreanText: "",
          englishText: "",
          romanization: "",
          narration: lesson.hook,
          visualPrompt: `Opening shot introducing ${lesson.title}. No text in image.`,
          animation: "zoom_in",
          background: "title card",
          transition: "cut",
        },
      },
    ];

    lesson.sections.forEach((section, index) => {
      drafts.push({
        weight: 3,
        scene: {
          type: "vocabulary",
          koreanText: section.korean,
          englishText: section.translation,
          romanization: section.romanization,
          narration: `${section.translation}. In Korean, ${section.korean}.`,
          visualPrompt: `Illustration representing "${section.translation}". No text in image.`,
          animation: pickAnimation(index),
          background: "clean backdrop",
          transition: index === 0 ? "fade" : "cut",
        },
      });

      // Long-form has room for the example sentence as its own beat.
      if (detailed && section.example) {
        drafts.push({
          weight: 3,
          scene: {
            type: "example",
            koreanText: section.example,
            englishText: "",
            romanization: "",
            narration: section.explanation || `For example: ${section.example}`,
            visualPrompt: `A realistic situation where someone says "${section.example}". No text in image.`,
            animation: "slide_up",
            background: "everyday scene",
            transition: "dissolve",
          },
        });
      }
    });

    lesson.quiz.forEach((question) => {
      drafts.push({
        weight: 3,
        scene: {
          type: "quiz",
          koreanText: "",
          englishText: question.question,
          romanization: "",
          narration: question.question,
          visualPrompt: "Quiz card with space for options. No text in image.",
          animation: "pop",
          background: "quiz card",
          transition: "slide",
        },
      });

      drafts.push({
        weight: 2,
        scene: {
          type: "answer",
          koreanText: question.answer,
          englishText: "",
          romanization: "",
          narration: `The answer is ${question.answer}.`,
          visualPrompt: "Answer reveal card. No text in image.",
          animation: "fade_in",
          background: "quiz card",
          transition: "cut",
        },
      });
    });

    drafts.push({
      weight: 2,
      scene: {
        type: "outro",
        koreanText: "",
        englishText: "",
        romanization: "",
        narration: "Follow for more Korean like this.",
        visualPrompt: "Closing shot with space for a subscribe prompt. No text in image.",
        animation: "fade_in",
        background: "end card",
        transition: "fade",
      },
    });

    const trimmed = fitSceneCount(drafts, targetDurationSeconds);
    const durations = distributeDurations(
      trimmed.map((draft) => draft.weight),
      targetDurationSeconds,
    );

    return {
      model: MOCK_MODEL_ID,
      scenes: trimmed.map((draft, index) => ({
        ...draft.scene,
        duration: durations[index],
      })),
    };
  }
}

interface Draft {
  weight: number;
  scene: Omit<GeneratedScene, "duration">;
}

const ANIMATION_CYCLE: SceneAnimation[] = [
  "fade_in",
  "slide_up",
  "pop",
  "typewriter",
  "slide_left",
];

function pickAnimation(index: number): SceneAnimation {
  return ANIMATION_CYCLE[index % ANIMATION_CYCLE.length];
}

/**
 * Every scene needs at least one second, so a very short target cannot hold
 * every draft. Drop from the middle, keeping the hook and the outro.
 */
function fitSceneCount(drafts: Draft[], totalSeconds: number): Draft[] {
  const maxScenes = Math.max(2, Math.floor(totalSeconds / MIN_SCENE_DURATION));
  if (drafts.length <= maxScenes) return drafts;

  const first = drafts[0];
  const last = drafts[drafts.length - 1];
  const middle = drafts.slice(1, -1).slice(0, maxScenes - 2);
  return [first, ...middle, last];
}

/**
 * Splits `total` seconds across weighted scenes as whole numbers that sum to
 * exactly `total`, giving every scene at least the minimum. Remainders go to
 * the scenes with the largest fractional part.
 */
function distributeDurations(weights: number[], total: number): number[] {
  const count = weights.length;
  if (count === 0) return [];

  const floor = MIN_SCENE_DURATION * count;
  if (total <= floor) return weights.map(() => MIN_SCENE_DURATION);

  const spare = total - floor;
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);

  const exact = weights.map((weight) => (weight / weightSum) * spare);
  const base = exact.map((value) => Math.floor(value));
  let remainder = spare - base.reduce((sum, value) => sum + value, 0);

  const byFraction = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);

  for (const { index } of byFraction) {
    if (remainder <= 0) break;
    base[index] += 1;
    remainder -= 1;
  }

  return base.map((value) =>
    Math.min(MAX_SCENE_DURATION, value + MIN_SCENE_DURATION),
  );
}
