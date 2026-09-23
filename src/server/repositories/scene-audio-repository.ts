import { getDb } from "@/server/db/client";
import type { VoiceSettings } from "@/types/voice";

export interface SceneAudioRecord {
  sceneId: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  durationSeconds: number;
  settings: VoiceSettings;
  voiceName: string;
  provider: string;
}

/**
 * Persistence for generated narration. Audio bytes live on disk; these rows
 * hold the reference and the settings each clip was rendered with.
 */
export const sceneAudioRepository = {
  /** Replaces any existing clip for the scene. Returns the previous file name. */
  async save(record: SceneAudioRecord): Promise<string | null> {
    const db = getDb();
    const existing = await db.sceneAudio.findUnique({
      where: { sceneId: record.sceneId },
      select: { fileName: true },
    });

    const columns = {
      fileName: record.fileName,
      mimeType: record.mimeType,
      byteSize: record.byteSize,
      durationSeconds: record.durationSeconds,
      language: record.settings.language,
      voiceId: record.settings.voiceId,
      voiceName: record.voiceName,
      speed: record.settings.speed,
      pitch: record.settings.pitch,
      volume: record.settings.volume,
      provider: record.provider,
      generatedAt: new Date(),
    };

    await db.sceneAudio.upsert({
      where: { sceneId: record.sceneId },
      create: { sceneId: record.sceneId, ...columns },
      update: columns,
    });

    return existing?.fileName ?? null;
  },

  /** Returns the removed file name, or null if there was nothing to remove. */
  async remove(sceneId: string): Promise<string | null> {
    const db = getDb();
    const existing = await db.sceneAudio.findUnique({
      where: { sceneId },
      select: { fileName: true },
    });

    if (!existing) return null;

    await db.sceneAudio.delete({ where: { sceneId } });
    return existing.fileName;
  },

  async findByFileName(fileName: string) {
    return getDb().sceneAudio.findFirst({
      where: { fileName },
      select: { fileName: true, mimeType: true },
    });
  },
};
