import { LEVEL_META, TARGET_LANGUAGE_META } from "@/lib/constants";
import type {
  GeneratedLesson,
  LessonGenerator,
} from "@/server/ai/lesson-generator";
import type { LessonGenerationRequest, LessonSection } from "@/types/lesson";
import { producesLongForm } from "@/types/project";

export const MOCK_MODEL_ID = "mock";

/**
 * Used when no AI_API_KEY is configured, so the whole create → review → edit
 * flow can be exercised without credentials.
 *
 * The content is deliberately, visibly placeholder: it names itself as sample
 * data in every field a user reads, so a mock lesson can never be mistaken for
 * a generated one.
 */
export class MockLessonGenerator implements LessonGenerator {
  async generate(request: LessonGenerationRequest): Promise<GeneratedLesson> {
    const sectionCount = producesLongForm(request.videoType) ? 6 : 3;

    return {
      model: MOCK_MODEL_ID,
      lesson: {
        title: `${request.topic} (sample)`,
        hook: "Sample lesson — no AI key is configured, so this content was not generated.",
        learning_objective: `Placeholder objective for "${request.topic}". Set AI_API_KEY in .env.local to generate a real lesson.`,
        level: LEVEL_META[request.level].label,
        language: TARGET_LANGUAGE_META[request.language].label,
        sections: SAMPLE_SECTIONS.slice(0, sectionCount),
        quiz: [
          {
            question: "This quiz is sample data. Which option says “hello”?",
            options: ["안녕하세요", "감사합니다", "죄송합니다"],
            answer: "안녕하세요",
          },
          {
            question: "Sample question — which option says “thank you”?",
            options: ["안녕하세요", "감사합니다", "괜찮아요"],
            answer: "감사합니다",
          },
        ],
      },
    };
  }
}

const SAMPLE_SECTIONS: LessonSection[] = [
  {
    korean: "안녕하세요",
    romanization: "annyeonghaseyo",
    translation: "Hello",
    explanation: "Sample content. The standard polite greeting, usable with anyone.",
    example: "안녕하세요, 처음 뵙겠습니다.",
  },
  {
    korean: "감사합니다",
    romanization: "gamsahamnida",
    translation: "Thank you",
    explanation: "Sample content. The formal way to say thank you.",
    example: "도와주셔서 감사합니다.",
  },
  {
    korean: "괜찮아요",
    romanization: "gwaenchanayo",
    translation: "It's okay / I'm fine",
    explanation: "Sample content. Works as reassurance and as a polite refusal.",
    example: "저는 괜찮아요.",
  },
  {
    korean: "얼마예요?",
    romanization: "eolmayeyo?",
    translation: "How much is it?",
    explanation: "Sample content. The standard way to ask a price.",
    example: "이거 얼마예요?",
  },
  {
    korean: "주세요",
    romanization: "juseyo",
    translation: "Please give me",
    explanation: "Sample content. Attach it to any noun to order or request.",
    example: "물 주세요.",
  },
  {
    korean: "어디예요?",
    romanization: "eodiyeyo?",
    translation: "Where is it?",
    explanation: "Sample content. Use it to ask where something is.",
    example: "화장실 어디예요?",
  },
];
