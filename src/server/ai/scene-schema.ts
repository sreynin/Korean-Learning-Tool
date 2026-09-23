import { z } from "zod";
import {
  MAX_SCENE_DURATION,
  MIN_SCENE_DURATION,
  SCENE_ANIMATIONS,
  SCENE_TRANSITIONS,
  SCENE_TYPES,
} from "@/types/scene";

const duration = z
  .number()
  .int("Duration must be a whole number of seconds.")
  .min(MIN_SCENE_DURATION, `Duration must be at least ${MIN_SCENE_DURATION}s.`)
  .max(MAX_SCENE_DURATION, `Duration must be at most ${MAX_SCENE_DURATION}s.`);

/**
 * Shape handed to the model as its structured-output format. `id` and `order`
 * are absent on purpose — the service assigns them, so the model cannot emit
 * duplicate ids or an order that disagrees with the array.
 *
 * Text fields allow empty strings: a hook scene legitimately has no Korean.
 */
export const generatedSceneSchema = z.object({
  type: z.enum(SCENE_TYPES),
  duration,
  koreanText: z.string(),
  englishText: z.string(),
  romanization: z.string(),
  narration: z.string(),
  visualPrompt: z.string(),
  animation: z.enum(SCENE_ANIMATIONS),
  background: z.string(),
  transition: z.enum(SCENE_TRANSITIONS),
});

export const generatedStoryboardSchema = z.object({
  scenes: z.array(generatedSceneSchema),
});

/**
 * Stricter schema for storyboards coming back from the editor. Narration is
 * required because a scene with no narration produces silence in the render.
 */
export const sceneEditSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().min(1),
  type: z.enum(SCENE_TYPES),
  duration,
  koreanText: z.string().trim().max(300),
  englishText: z.string().trim().max(300),
  romanization: z.string().trim().max(300),
  narration: z
    .string()
    .trim()
    .min(1, "Narration cannot be empty.")
    .max(1000, "Narration must be 1000 characters or fewer."),
  visualPrompt: z.string().trim().max(1000),
  animation: z.enum(SCENE_ANIMATIONS),
  background: z.string().trim().max(300),
  transition: z.enum(SCENE_TRANSITIONS),
  // Substrings of koreanText to highlight. Absent on older clients, so it
  // defaults rather than rejecting the save.
  highlightTerms: z
    .array(z.string().trim().min(1).max(100))
    .max(20, "A scene can highlight at most 20 terms.")
    .default([]),
});

export const storyboardEditSchema = z.object({
  scenes: z
    .array(sceneEditSchema)
    .min(1, "A storyboard needs at least one scene.")
    .max(120, "A storyboard cannot exceed 120 scenes."),
});
