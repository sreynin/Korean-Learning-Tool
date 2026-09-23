import type { VoiceLanguage, VoiceOption, VoiceSettings } from "@/types/voice";

export interface SpeechRequest {
  text: string;
  settings: VoiceSettings;
}

export interface GeneratedSpeech {
  audio: Uint8Array;
  mimeType: string;
  /** File extension without the dot, e.g. "mp3". */
  extension: string;
  durationSeconds: number;
  /** Human-readable name of the voice actually used. */
  voiceName: string;
}

/**
 * The boundary between the app and whichever text-to-speech service is in use.
 * Swapping providers means writing one new implementation of this — nothing
 * above it knows the provider exists.
 */
export interface TextToSpeechProvider {
  /** Identifier stored alongside generated clips, e.g. "elevenlabs". */
  readonly name: string;
  /**
   * Which settings this provider applies during synthesis. Anything false is
   * either applied at playback instead or not applied at all, and the UI says
   * so rather than offering a control that quietly does nothing.
   */
  readonly capabilities: ProviderCapabilities;
  generateSpeech(request: SpeechRequest): Promise<GeneratedSpeech>;
  getVoices(language?: VoiceLanguage): Promise<VoiceOption[]>;
}

export interface ProviderCapabilities {
  speed: boolean;
  pitch: boolean;
  volume: boolean;
}
