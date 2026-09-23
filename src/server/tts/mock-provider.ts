import type {
  GeneratedSpeech,
  SpeechRequest,
  TextToSpeechProvider,
} from "@/server/tts/text-to-speech-provider";
import type { VoiceLanguage, VoiceOption } from "@/types/voice";

export const MOCK_PROVIDER_NAME = "mock";

const SAMPLE_RATE = 22050;

/**
 * Used when no ELEVENLABS_API_KEY is configured, so the whole generate →
 * play → regenerate → delete flow works without credentials.
 *
 * It produces a real, playable WAV whose **duration is estimated from the
 * narration** at the requested speed. The audio itself is silent: synthesising
 * speech without a provider is not possible, and a tone would be mistaken for
 * working output. The duration is the part that is genuinely useful — it lets
 * scene timing be checked before any provider is paid for.
 */
export class MockTextToSpeechProvider implements TextToSpeechProvider {
  readonly name = MOCK_PROVIDER_NAME;
  readonly capabilities = { speed: true, pitch: true, volume: true };

  async generateSpeech(request: SpeechRequest): Promise<GeneratedSpeech> {
    const durationSeconds = estimateDuration(
      request.text,
      request.settings.language,
      request.settings.speed,
    );

    return {
      audio: silentWav(durationSeconds),
      mimeType: "audio/wav",
      extension: "wav",
      durationSeconds,
      voiceName:
        MOCK_VOICES.find((voice) => voice.id === request.settings.voiceId)?.name ??
        "Mock voice",
    };
  }

  async getVoices(language?: VoiceLanguage): Promise<VoiceOption[]> {
    return language
      ? MOCK_VOICES.filter((voice) => voice.language === language)
      : MOCK_VOICES;
  }
}

const MOCK_VOICES: VoiceOption[] = [
  {
    id: "ko-female-natural",
    name: "Soyeon (Korean, female)",
    language: "korean",
    gender: "female",
    description: "Natural Korean female voice. Warm and clear.",
  },
  {
    id: "ko-male-natural",
    name: "Minjun (Korean, male)",
    language: "korean",
    gender: "male",
    description: "Natural Korean male voice. Steady and neutral.",
  },
  {
    id: "en-female-natural",
    name: "Ava (English, female)",
    language: "english",
    gender: "female",
    description: "Natural English female voice. Friendly and clear.",
  },
  {
    id: "en-male-natural",
    name: "Noah (English, male)",
    language: "english",
    gender: "male",
    description: "Natural English male voice. Calm and even.",
  },
];

/**
 * Rough narration length. Korean is counted in syllable blocks and English in
 * words, which are the units each language actually paces by.
 */
export function estimateDuration(
  text: string,
  language: VoiceLanguage,
  speed: number,
): number {
  const trimmed = text.trim();
  if (!trimmed) return 0.5;

  const seconds =
    language === "korean"
      ? countHangulSyllables(trimmed) / 3.5
      : trimmed.split(/\s+/).length / 2.8;

  const safeSpeed = speed > 0 ? speed : 1;
  return Math.max(0.5, Math.round((seconds / safeSpeed) * 10) / 10);
}

function countHangulSyllables(text: string): number {
  const syllables = text.match(/[가-힣]/g)?.length ?? 0;
  // Fall back to words when the narration is not actually in Korean.
  return syllables > 0 ? syllables : text.split(/\s+/).length * 2.5;
}

/** Minimal 16-bit mono PCM WAV. Header then zeroed samples. */
function silentWav(durationSeconds: number): Uint8Array {
  const frames = Math.max(1, Math.round(durationSeconds * SAMPLE_RATE));
  const dataSize = frames * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, 1, true); // channels
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, dataSize, true);

  return new Uint8Array(buffer);
}
