import type { SceneAudio } from "@/types/voice";

/**
 * Storyboard model. A lesson is converted into an ordered list of scenes,
 * each of which becomes one shot in the finished video.
 *
 * Nothing here renders video — this is the editable plan that a renderer will
 * consume later.
 */

export const SCENE_TYPES = [
  "hook",
  "vocabulary",
  "grammar",
  "example",
  "explanation",
  "quiz",
  "answer",
  "practice",
  "outro",
] as const;
export type SceneType = (typeof SCENE_TYPES)[number];

/**
 * Constrained rather than free text so a renderer can map each value onto a
 * real effect. Free-form strings would be unimplementable in the render stage.
 */
export const SCENE_ANIMATIONS = [
  "none",
  "fade_in",
  "slide_up",
  "slide_left",
  "pop",
  "zoom_in",
  "typewriter",
] as const;
export type SceneAnimation = (typeof SCENE_ANIMATIONS)[number];

export const SCENE_TRANSITIONS = [
  "cut",
  "fade",
  "slide",
  "zoom",
  "dissolve",
] as const;
export type SceneTransition = (typeof SCENE_TRANSITIONS)[number];

export const MIN_SCENE_DURATION = 1;
export const MAX_SCENE_DURATION = 60;

export interface Scene {
  id: string;
  /** 1-based position. Always renumbered from array order on save. */
  order: number;
  type: SceneType;
  /** Seconds on screen. */
  duration: number;
  /** Korean script shown on screen. Empty when the scene has none. */
  koreanText: string;
  /** Translation shown on screen. Empty when the scene has none. */
  englishText: string;
  /** Romanization shown on screen. Empty when the scene has none. */
  romanization: string;
  /** What the voice-over says. */
  narration: string;
  /** Image-generation prompt for the background or illustration. */
  visualPrompt: string;
  animation: SceneAnimation;
  /** Short description of the backdrop, e.g. "warm café interior". */
  background: string;
  /** How this scene enters from the previous one. */
  transition: SceneTransition;
  /** Substrings of `koreanText` to highlight in captions. */
  highlightTerms: string[];
  /** Generated narration audio, or null until it has been generated. */
  audio: SceneAudio | null;
}

/** A storyboard as stored on a project, with provenance. */
export interface StoredScenes {
  scenes: Scene[];
  /** ISO 8601 */
  generatedAt: string;
  /** Model id that produced it, or "mock" when no API key is configured. */
  model: string;
  /** ISO 8601 of the last manual edit, or null if untouched. */
  editedAt: string | null;
}

/** What the model returns: `id`, `order`, and `audio` are not its concern. */
export type GeneratedScene = Omit<
  Scene,
  "id" | "order" | "audio" | "highlightTerms"
>;

export const EMPTY_SCENE: GeneratedScene & {
  audio: null;
  highlightTerms: string[];
} = {
  type: "vocabulary",
  duration: 4,
  koreanText: "",
  englishText: "",
  romanization: "",
  narration: "",
  visualPrompt: "",
  animation: "fade_in",
  background: "",
  transition: "cut",
  highlightTerms: [],
  audio: null,
};

export function totalSceneDuration(scenes: Scene[]): number {
  return scenes.reduce((total, scene) => total + scene.duration, 0);
}
