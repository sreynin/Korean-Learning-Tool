/**
 * Narration settings and generated audio.
 *
 * Scope note: the spec calls for Korean and English narration, so those are
 * the two voice languages. A project whose `targetLanguage` is Chinese falls
 * back to the English voice until a Chinese voice is added.
 */

export const VOICE_LANGUAGES = ["korean", "english"] as const;
export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number];

export const MIN_SPEED = 0.5;
export const MAX_SPEED = 2;
export const MIN_PITCH = -12;
export const MAX_PITCH = 12;
export const MIN_VOLUME = 0;
export const MAX_VOLUME = 2;

export interface VoiceSettings {
  language: VoiceLanguage;
  /** Provider-specific voice id. */
  voiceId: string;
  /** Playback rate multiplier. 1.0 is the voice's natural pace. */
  speed: number;
  /** Semitones away from the voice's natural pitch. 0 is unchanged. */
  pitch: number;
  /** Gain multiplier. 1.0 is unchanged. */
  volume: number;
}

export interface VoiceOption {
  id: string;
  name: string;
  language: VoiceLanguage;
  gender: "female" | "male";
  description: string;
}

/** Generated narration for one scene. */
export interface SceneAudio {
  /** Serving URL, not a filesystem path. */
  url: string;
  mimeType: string;
  byteSize: number;
  durationSeconds: number;
  /** Settings this clip was rendered with — may differ from current settings. */
  settings: VoiceSettings;
  voiceName: string;
  /** "elevenlabs" or "mock". */
  provider: string;
  /** ISO 8601 */
  generatedAt: string;
}

export const DEFAULT_VOICE_IDS: Record<VoiceLanguage, string> = {
  korean: "ko-female-natural",
  english: "en-female-natural",
};

export function defaultVoiceSettings(language: VoiceLanguage): VoiceSettings {
  return {
    language,
    voiceId: DEFAULT_VOICE_IDS[language],
    speed: 1,
    pitch: 0,
    volume: 1,
  };
}
