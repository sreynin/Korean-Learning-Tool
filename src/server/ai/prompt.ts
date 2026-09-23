import {
  CONTENT_STYLE_META,
  LEVEL_META,
  TARGET_LANGUAGE_META,
} from "@/lib/constants";
import type { LessonGenerationRequest } from "@/types/lesson";
import type {
  ContentStyle,
  ProficiencyLevel,
  VideoFormat,
} from "@/types/project";

/**
 * Stable across every request, so it sits first and can be cached. Anything
 * request-specific belongs in the user message.
 */
export const LESSON_SYSTEM_PROMPT = `You are an experienced Korean-language teacher who writes scripts for short educational videos. You write lessons that a learner can follow without a teacher present.

Non-negotiable rules:

1. NATURAL KOREAN. Write what a Korean person would actually say. Never translate the target language word-for-word into Korean. If a textbook phrase is technically correct but nobody says it, use the common spoken form instead.

2. ACCURACY OVER FLUENCY. Never invent words, endings, or idioms. If you are not confident a phrase is correct and current, replace it with one you are confident about. A simpler correct lesson beats an impressive wrong one.

3. KEEP THE THREE LAYERS SEPARATE.
   - "korean": Korean script only. No romanization, no translation, no parentheses containing either.
   - "romanization": Revised Romanization of the Korean field only.
   - "translation": natural target-language meaning only — not a word-by-word gloss.

4. MATCH THE LEVEL. The stated learner level is a ceiling, not a suggestion. Every word, ending, and sentence must be reachable at that level.

5. NO UNNECESSARY DIFFICULTY. Prefer the most common word for the meaning. Do not introduce vocabulary the lesson does not need, and never use an advanced grammar form to teach a basic point.

6. USEFUL EXAMPLES. Every section needs an example sentence a learner could realistically say that week. Use the section's item in a concrete situation — no abstract filler sentences.

7. QUIZ INTEGRITY. Each question must have exactly one correct option, and "answer" must be character-for-character identical to that option. Wrong options must be plausible but clearly wrong to someone who understood the lesson.

8. HOOK. The hook is the first line spoken on camera. One sentence, concrete, and about the lesson's actual content — no "In this video we will learn".

Write the "hook", "learning_objective", "translation", and "explanation" fields in the requested target language. The "korean" and "romanization" fields are always Korean and its romanization regardless of target language.`;

/** Level-specific ceilings, phrased as constraints the model can check itself. */
const LEVEL_GUIDANCE: Record<ProficiencyLevel, string> = {
  beginner:
    "Absolute beginner. Assume they have just learned to read Hangul. Use only the most frequent everyday words. Stick to the polite -요 form and simple present tense. Keep Korean sentences under about six words. No honorific verb forms, no clause connectors beyond -고.",
  elementary:
    "Has the basics. Knows -요 speech, present and past tense, and core particles (은/는, 이/가, 을/를, 에, 에서). You may use simple connectors (-고, -지만, -아서/어서) and common irregular verbs. Keep sentences to one or two clauses.",
  intermediate:
    "Comfortable in everyday conversation. You may use clause connectors, indirect speech (-다고 하다), modifiers (-는/은/을), and compare grammar forms that learners confuse. Explain nuance between similar expressions rather than just meaning.",
  advanced:
    "Near-fluent. Use idiomatic and register-sensitive Korean, written and formal forms, and subtle nuance. Assume grammar knowledge and focus on why a native speaker picks one form over another, including connotation and social context.",
};

/** Depth and length budget per video format. */
function formatGuidance(videoType: VideoFormat, topic: string): string {
  if (videoType === "shorts") {
    return `Format: YouTube Short. This must be tight enough to narrate in under a minute.
- 3 to 5 sections, no more.
- Exactly 2 quiz questions, 3 options each.
- "explanation" is one short sentence per section. Cut anything that is merely interesting.
- Teach one idea only. If "${topic}" is broad, narrow it to the single most useful slice and make the title reflect that narrower scope.`;
  }

  if (videoType === "long") {
    return `Format: long-form YouTube video, several minutes of narration.
- 6 to 10 sections, ordered so each builds on the last.
- 4 to 6 quiz questions, 4 options each.
- "explanation" is two to three sentences: the rule, why it works that way, and the mistake learners usually make.
- Cover "${topic}" thoroughly enough that a learner needs no follow-up video.`;
  }

  return `Format: one lesson that will be cut into both a Short and a long-form video. Write it at long-form depth and order the sections so the first three stand alone as the Short.
- 6 to 10 sections, most important first.
- 4 to 6 quiz questions, 4 options each.
- "explanation" is two to three sentences.`;
}

export function buildLessonPrompt(request: LessonGenerationRequest): string {
  const language = TARGET_LANGUAGE_META[request.language].label;

  return `Write a Korean-learning lesson.

Topic: ${request.topic}
Learner level: ${LEVEL_META[request.level].label}
Target language (for explanations and translations): ${language}
Content style: ${CONTENT_STYLE_META[request.style].label}

Level constraints: ${LEVEL_GUIDANCE[request.level]}

${formatGuidance(request.videoType, request.topic)}

Content style means: ${CONTENT_STYLE_GUIDANCE[request.style]}

Set "level" to "${LEVEL_META[request.level].label}" and "language" to "${language}".`;
}

const CONTENT_STYLE_GUIDANCE: Record<ContentStyle, string> = {
  vocabulary:
    "each section teaches one word or set phrase — the item goes in \"korean\", and the example shows it in a full sentence.",
  grammar:
    "each section teaches one grammar pattern — put the pattern itself in \"korean\", and show a complete sentence using it in \"example\".",
  conversation:
    "the sections form one realistic dialogue in order, one turn per section. The learner should be able to hold the whole exchange by the end.",
  pronunciation:
    "each section covers one sound or sound-change rule. Put the affected word in \"korean\", show the actual pronunciation in \"romanization\", and name the rule in \"explanation\".",
  quiz:
    "teach briefly, then test hard. Keep sections short and make the quiz the substance of the lesson, covering every section.",
  culture:
    "each section ties a Korean phrase to the cultural situation where it is used, and the explanation covers the social rule a foreigner would otherwise get wrong.",
  food:
    "centre everything on food, ordering, and eating. Use real dish names and the language actually used in restaurants and markets.",
  travel:
    "everything must be usable by a visitor within their first week — transport, directions, accommodation, and shopping.",
};
