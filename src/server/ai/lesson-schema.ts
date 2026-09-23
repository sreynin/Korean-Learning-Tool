import { z } from "zod";
import type { Lesson, QuizQuestion } from "@/types/lesson";

/**
 * Schema handed to the model as the structured-output format. Kept permissive
 * on purpose: shape is enforced here, quality is steered by the prompt. A
 * rejected generation is worse for the user than a lesson they can edit.
 */
export const lessonSchema = z.object({
  title: z.string(),
  hook: z.string(),
  learning_objective: z.string(),
  level: z.string(),
  language: z.string(),
  sections: z.array(
    z.object({
      korean: z.string(),
      romanization: z.string(),
      translation: z.string(),
      explanation: z.string(),
      example: z.string(),
    }),
  ),
  quiz: z.array(
    z.object({
      question: z.string(),
      options: z.array(z.string()),
      answer: z.string(),
    }),
  ),
});

const required = (label: string) =>
  z.string().trim().min(1, `${label} cannot be empty.`);

/**
 * Stricter schema for lessons coming back from the editor. A human saving a
 * lesson should not be able to store blank required fields.
 */
export const lessonEditSchema = z.object({
  title: required("Title").max(200),
  hook: required("Hook").max(1000),
  learning_objective: required("Learning objective").max(1000),
  level: required("Level").max(50),
  language: required("Language").max(50),
  sections: z
    .array(
      z.object({
        korean: required("Korean").max(500),
        romanization: required("Romanization").max(500),
        translation: required("Translation").max(500),
        explanation: z.string().trim().max(2000),
        example: z.string().trim().max(1000),
      }),
    )
    .min(1, "A lesson needs at least one section."),
  quiz: z.array(
    z.object({
      question: required("Question").max(500),
      options: z
        .array(required("Option").max(300))
        .min(2, "A question needs at least two options."),
      answer: required("Answer").max(300),
    }),
  ),
});

/**
 * Models occasionally return an `answer` that is worded slightly differently
 * from the matching option. Snap it back when the intent is unambiguous rather
 * than failing the whole generation — anything left unmatched is still editable.
 */
export function reconcileQuizAnswers(lesson: Lesson): Lesson {
  return {
    ...lesson,
    quiz: lesson.quiz.map(snapAnswerToOption),
  };
}

function snapAnswerToOption(question: QuizQuestion): QuizQuestion {
  if (question.options.includes(question.answer)) return question;

  const normalise = (value: string) => value.trim().toLowerCase();
  const match = question.options.find(
    (option) => normalise(option) === normalise(question.answer),
  );

  return match ? { ...question, answer: match } : question;
}
