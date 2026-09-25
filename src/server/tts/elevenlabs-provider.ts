import { AppError } from "@/server/errors";
import { estimateDuration } from "@/server/tts/mock-provider";
import type {
  GeneratedSpeech,
  SpeechRequest,
  TextToSpeechProvider,
} from "@/server/tts/text-to-speech-provider";
import { DEFAULT_VOICE_IDS } from "@/types/voice";
import type { VoiceLanguage, VoiceOption } from "@/types/voice";
import { createLogger } from "@/server/logger";

const log = createLogger("tts");

const API_BASE = "https://api.elevenlabs.io/v1";

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  description?: string | null;
  labels?: Record<string, string> | null;
}

/**
 * ElevenLabs text-to-speech.
 *
 * Pitch is not applied: the API exposes stability and style rather than a
 * pitch control, so `capabilities.pitch` is false and the UI marks the slider
 * as unsupported instead of pretending it works. Volume is applied at playback
 * by the audio element, not during synthesis.
 */
export class ElevenLabsProvider implements TextToSpeechProvider {
  readonly name = "elevenlabs";
  readonly capabilities = { speed: true, pitch: false, volume: false };

  private readonly apiKey: string;
  private readonly model: string;
  private voiceCache: VoiceOption[] | null = null;

  constructor(options: { apiKey: string; model: string }) {
    this.apiKey = options.apiKey;
    this.model = options.model;
  }

  async generateSpeech(request: SpeechRequest): Promise<GeneratedSpeech> {
    const { settings, text } = request;
    const voiceId = await this.resolveVoiceId(settings.voiceId, settings.language);

    let response: Response;
    try {
      response = await fetch(`${API_BASE}/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: this.model,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            speed: settings.speed,
          },
        }),
      });
    } catch (error) {
      log.error("connection error", error);
      throw new AppError(
        "generation_failed",
        "Could not reach the voice provider. Check your connection and try again.",
        502,
      );
    }

    if (!response.ok) {
      throw await toAppError(response);
    }

    const audio = new Uint8Array(await response.arrayBuffer());
    if (audio.byteLength === 0) {
      throw new AppError(
        "generation_failed",
        "The voice provider returned an empty audio file.",
        502,
      );
    }

    const voices = await this.getVoices();

    return {
      audio,
      mimeType: "audio/mpeg",
      extension: "mp3",
      // The API returns audio without a duration header. This estimate is
      // replaced by the real value once the browser loads the clip.
      durationSeconds: estimateDuration(text, settings.language, settings.speed),
      voiceName: voices.find((v) => v.id === voiceId)?.name ?? voiceId,
    };
  }

  async getVoices(language?: VoiceLanguage): Promise<VoiceOption[]> {
    if (!this.voiceCache) {
      let response: Response;
      try {
        response = await fetch(`${API_BASE}/voices`, {
          headers: { "xi-api-key": this.apiKey },
        });
      } catch (error) {
        log.error("connection error", error);
        throw new AppError(
          "generation_failed",
          "Could not reach the voice provider to list voices.",
          502,
        );
      }

      if (!response.ok) {
        throw await toAppError(response);
      }

      const payload = (await response.json()) as { voices?: ElevenLabsVoice[] };
      this.voiceCache = (payload.voices ?? []).map(toVoiceOption);
    }

    return language
      ? this.voiceCache.filter((voice) => voice.language === language)
      : this.voiceCache;
  }

  /**
   * The built-in defaults are placeholders, not real provider ids. Swap one
   * for the first voice the account actually has in that language.
   */
  private async resolveVoiceId(
    voiceId: string,
    language: VoiceLanguage,
  ): Promise<string> {
    const isPlaceholder = Object.values(DEFAULT_VOICE_IDS).includes(voiceId);
    if (!isPlaceholder) return voiceId;

    const voices = await this.getVoices(language);
    if (voices.length === 0) {
      throw new AppError(
        "generation_failed",
        `No ${language} voice is available on this ElevenLabs account. Pick a voice in the project's voice settings.`,
        422,
      );
    }

    return (
      voices.find((voice) => voice.gender === "female")?.id ?? voices[0].id
    );
  }
}

function toVoiceOption(voice: ElevenLabsVoice): VoiceOption {
  const labels = voice.labels ?? {};
  const language: VoiceLanguage =
    (labels.language ?? "").toLowerCase().startsWith("ko") ? "korean" : "english";

  return {
    id: voice.voice_id,
    name: voice.name,
    language,
    gender: (labels.gender ?? "").toLowerCase() === "male" ? "male" : "female",
    description: voice.description ?? labels.description ?? "",
  };
}

async function toAppError(response: Response): Promise<AppError> {
  // Read the body for the log, never for the client — it can echo the request.
  const detail = await response.text().catch(() => "");
  log.error("provider error", { status: response.status, detail: detail.slice(0, 300) });

  if (response.status === 401 || response.status === 403) {
    return new AppError(
      "generation_failed",
      "The configured ELEVENLABS_API_KEY was rejected. Check it in .env.local.",
      502,
    );
  }

  if (response.status === 429) {
    return new AppError(
      "generation_failed",
      "The voice provider is rate limiting requests. Wait a moment and try again.",
      429,
    );
  }

  if (response.status === 422) {
    return new AppError(
      "generation_failed",
      "The voice provider rejected these settings. Try a different voice.",
      422,
    );
  }

  return new AppError(
    "generation_failed",
    "The voice provider returned an error. Try again in a moment.",
    502,
  );
}
