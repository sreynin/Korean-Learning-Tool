import { randomUUID } from "node:crypto";
import { DEFAULT_CAPTION_SETTINGS } from "@/types/caption";
import { PIPELINE_STAGES } from "@/types/project";
import type { ProjectPipeline, VideoProject } from "@/types/project";
import type { Scene, StoredScenes } from "@/types/scene";
import type { StoredLesson } from "@/types/lesson";
import { defaultVoiceSettings } from "@/types/voice";

function emptyPipeline(): ProjectPipeline {
  return Object.fromEntries(
    PIPELINE_STAGES.map((stage) => [
      stage,
      stage === "topic"
        ? { status: "complete", updatedAt: new Date().toISOString() }
        : { status: "pending", updatedAt: null },
    ]),
  ) as ProjectPipeline;
}

export function makeProject(overrides: Partial<VideoProject> = {}): VideoProject {
  const now = new Date().toISOString();

  return {
    id: randomUUID(),
    title: "Korean Numbers 1-5",
    topic: "Korean Numbers 1-5",
    description: "",
    format: "shorts",
    status: "draft",
    level: "beginner",
    targetLanguage: "english",
    contentStyle: "vocabulary",
    visualStyle: "minimal",
    shortsDurationSeconds: 30,
    longDurationSeconds: null,
    lesson: null,
    scenes: null,
    voiceSettings: defaultVoiceSettings("english"),
    captionSettings: DEFAULT_CAPTION_SETTINGS,
    captionsConfigured: false,
    previewReviewedAt: null,
    latestRender: null,
    hasRenderOutput: false,
    pipeline: emptyPipeline(),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function makeLesson(overrides: Partial<StoredLesson> = {}): StoredLesson {
  return {
    content: {
      title: "Korean Numbers 1-5",
      hook: "Can you count to five in Korean?",
      learning_objective: "Say one through five.",
      level: "Beginner",
      language: "English",
      sections: [
        {
          korean: "하나",
          romanization: "hana",
          translation: "One",
          explanation: "The native Korean number one.",
          example: "사과 하나 주세요.",
        },
      ],
      quiz: [{ question: "Which means one?", options: ["하나", "둘"], answer: "하나" }],
    },
    generatedAt: new Date().toISOString(),
    model: "mock",
    editedAt: null,
    ...overrides,
  };
}

export function makeScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: randomUUID(),
    order: 1,
    type: "vocabulary",
    duration: 4,
    koreanText: "하나",
    englishText: "One",
    romanization: "hana",
    narration: "One. In Korean, hana.",
    visualPrompt: "A single apple.",
    animation: "fade_in",
    background: "clean backdrop",
    transition: "cut",
    highlightTerms: [],
    audio: null,
    ...overrides,
  };
}

export function makeStoredScenes(scenes: Scene[]): StoredScenes {
  return {
    scenes: scenes.map((scene, index) => ({ ...scene, order: index + 1 })),
    generatedAt: new Date().toISOString(),
    model: "mock",
    editedAt: null,
  };
}
