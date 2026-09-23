import type { Lesson, LessonGenerationRequest } from "@/types/lesson";

export interface GeneratedLesson {
  lesson: Lesson;
  /** Model id that produced it, or "mock" when no provider is configured. */
  model: string;
}

/**
 * The boundary between the app and whichever model produces lessons.
 * Swapping providers means writing one new implementation of this.
 */
export interface LessonGenerator {
  generate(request: LessonGenerationRequest): Promise<GeneratedLesson>;
}
