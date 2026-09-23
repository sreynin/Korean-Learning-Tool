import { getServerEnv } from "@/lib/env";
import { ElevenLabsProvider } from "@/server/tts/elevenlabs-provider";
import { MockTextToSpeechProvider } from "@/server/tts/mock-provider";
import type { TextToSpeechProvider } from "@/server/tts/text-to-speech-provider";

/**
 * Single composition point for text-to-speech. Without an ELEVENLABS_API_KEY
 * the app falls back to the mock provider rather than failing, matching how
 * lesson and scene generation behave.
 */
const globalForTts = globalThis as unknown as {
  __ttsProvider?: TextToSpeechProvider;
};

export function getTextToSpeechProvider(): TextToSpeechProvider {
  if (!globalForTts.__ttsProvider) {
    const env = getServerEnv();

    globalForTts.__ttsProvider = env.ELEVENLABS_API_KEY
      ? new ElevenLabsProvider({
          apiKey: env.ELEVENLABS_API_KEY,
          model: env.ELEVENLABS_MODEL,
        })
      : new MockTextToSpeechProvider();
  }

  return globalForTts.__ttsProvider;
}

export type { TextToSpeechProvider };
