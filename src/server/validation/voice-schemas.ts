import { z } from "zod";
import {
  MAX_PITCH,
  MAX_SPEED,
  MAX_VOLUME,
  MIN_PITCH,
  MIN_SPEED,
  MIN_VOLUME,
  VOICE_LANGUAGES,
} from "@/types/voice";

const speed = z
  .number()
  .min(MIN_SPEED, `Speed must be at least ${MIN_SPEED}×.`)
  .max(MAX_SPEED, `Speed must be at most ${MAX_SPEED}×.`);

const pitch = z
  .number()
  .min(MIN_PITCH, `Pitch must be at least ${MIN_PITCH} semitones.`)
  .max(MAX_PITCH, `Pitch must be at most ${MAX_PITCH} semitones.`);

const volume = z
  .number()
  .min(MIN_VOLUME, `Volume must be at least ${MIN_VOLUME}.`)
  .max(MAX_VOLUME, `Volume must be at most ${MAX_VOLUME}.`);

export const voiceSettingsSchema = z.object({
  language: z.enum(VOICE_LANGUAGES),
  voiceId: z.string().trim().min(1, "Choose a voice."),
  speed,
  pitch,
  volume,
});

/** Per-scene overrides when generating a single clip. */
export const generateAudioSchema = z
  .object({
    language: z.enum(VOICE_LANGUAGES).optional(),
    voiceId: z.string().trim().min(1).optional(),
    speed: speed.optional(),
    pitch: pitch.optional(),
    volume: volume.optional(),
  })
  .optional();

export const voiceQuerySchema = z.object({
  language: z.enum(VOICE_LANGUAGES).optional(),
});
