import type {
  ContentStyle,
  ProficiencyLevel,
  TargetLanguage,
  VideoFormat,
} from "@/types/project";

/**
 * The structured lesson the AI returns.
 *
 * Field names are snake_case because this object is the contract with the
 * model — it is generated, stored, and edited as one document. The rest of the
 * codebase stays camelCase; this shape deliberately does not.
 */

export interface LessonSection {
  /** Korean script only — no romanization, no translation. */
  korean: string;
  /** Revised Romanization of `korean`. */
  romanization: string;
  /** Natural translation into the target language. */
  translation: string;
  /** Why it works this way, at the learner's level. */
  explanation: string;
  /** A realistic sentence using the item in context. */
  example: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  /** Must match one of `options` exactly. */
  answer: string;
}

export interface Lesson {
  title: string;
  hook: string;
  learning_objective: string;
  level: string;
  language: string;
  sections: LessonSection[];
  quiz: QuizQuestion[];
}

/** A lesson as stored on a project, with provenance. */
export interface StoredLesson {
  content: Lesson;
  /** ISO 8601 */
  generatedAt: string;
  /** Model id that produced it, or "mock" when no API key is configured. */
  model: string;
  /** ISO 8601 of the last manual edit, or null if untouched. */
  editedAt: string | null;
}

export interface LessonGenerationRequest {
  topic: string;
  level: ProficiencyLevel;
  videoType: VideoFormat;
  language: TargetLanguage;
  style: ContentStyle;
}

export const EMPTY_SECTION: LessonSection = {
  korean: "",
  romanization: "",
  translation: "",
  explanation: "",
  example: "",
};

export const EMPTY_QUIZ_QUESTION: QuizQuestion = {
  question: "",
  options: ["", ""],
  answer: "",
};
