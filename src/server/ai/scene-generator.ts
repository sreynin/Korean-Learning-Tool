import type { ScenePromptInput } from "@/server/ai/scene-prompt";
import type { GeneratedScene } from "@/types/scene";

export interface GeneratedStoryboard {
  scenes: GeneratedScene[];
  /** Model id that produced it, or "mock" when no provider is configured. */
  model: string;
}

/**
 * The boundary between the app and whichever model produces storyboards.
 * Swapping providers means writing one new implementation of this.
 */
export interface SceneGenerator {
  generate(input: ScenePromptInput): Promise<GeneratedStoryboard>;
}
