import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { getProjectRepository } from "@/server/repositories";
import { sceneAudioRepository } from "@/server/repositories/scene-audio-repository";
import { getProject } from "@/server/services/project-service";
import { deleteAudioFile, writeAudioFile } from "@/server/tts/audio-storage";
import { getTextToSpeechProvider } from "@/server/tts";
import type { VideoProject } from "@/types/project";
import type { VoiceLanguage, VoiceOption, VoiceSettings } from "@/types/voice";

export async function listVoices(
  language?: VoiceLanguage,
): Promise<{ voices: VoiceOption[]; provider: string; capabilities: unknown }> {
  const provider = getTextToSpeechProvider();
  return {
    voices: await provider.getVoices(language),
    provider: provider.name,
    capabilities: provider.capabilities,
  };
}

/**
 * Renders one scene's narration. `overrides` lets a single scene be generated
 * with different settings without changing the project default.
 */
export async function generateSceneAudio(
  projectId: string,
  sceneId: string,
  overrides?: Partial<VoiceSettings>,
): Promise<VideoProject> {
  const project = await getProject(projectId);
  const scene = project.scenes?.scenes.find((item) => item.id === sceneId);

  if (!scene) {
    throw new NotFoundError(`No scene found with id "${sceneId}".`);
  }

  if (!scene.narration.trim()) {
    throw new ConflictError(
      "This scene has no narration to speak. Add narration in the storyboard first.",
    );
  }

  const settings: VoiceSettings = { ...project.voiceSettings, ...overrides };
  const provider = getTextToSpeechProvider();

  const speech = await provider.generateSpeech({
    text: scene.narration,
    settings,
  });

  const fileName = await writeAudioFile(speech.audio, speech.extension);

  const replaced = await sceneAudioRepository.save({
    sceneId,
    fileName,
    mimeType: speech.mimeType,
    byteSize: speech.audio.byteLength,
    durationSeconds: speech.durationSeconds,
    settings,
    voiceName: speech.voiceName,
    provider: provider.name,
  });

  // Only remove the old file once the new row is committed, so a failure part
  // way through never leaves a row pointing at a deleted file.
  if (replaced) {
    await deleteAudioFile(replaced);
  }

  return syncVoiceStage(projectId);
}

export async function deleteSceneAudio(
  projectId: string,
  sceneId: string,
): Promise<VideoProject> {
  const project = await getProject(projectId);
  const scene = project.scenes?.scenes.find((item) => item.id === sceneId);

  if (!scene) {
    throw new NotFoundError(`No scene found with id "${sceneId}".`);
  }

  const removed = await sceneAudioRepository.remove(sceneId);
  if (removed) {
    await deleteAudioFile(removed);
  }

  return syncVoiceStage(projectId);
}

export async function updateVoiceSettings(
  projectId: string,
  settings: VoiceSettings,
): Promise<VideoProject> {
  const provider = getTextToSpeechProvider();
  const voices = await provider.getVoices(settings.language);

  // A voice id from another language would silently produce the wrong accent.
  if (voices.length > 0 && !voices.some((voice) => voice.id === settings.voiceId)) {
    throw new ValidationError("That voice is not available for this language.", [
      { field: "voiceId", message: "Choose a voice from the selected language." },
    ]);
  }

  const updated = await getProjectRepository().update(projectId, {
    voiceSettings: settings,
    updatedAt: new Date().toISOString(),
  });

  if (!updated) {
    throw new NotFoundError(`No project found with id "${projectId}".`);
  }
  return updated;
}

/**
 * The voice stage is complete only when every scene has audio. Anything less
 * is partial work, and reporting it as done would be a lie the render stage
 * would then trip over.
 */
async function syncVoiceStage(projectId: string): Promise<VideoProject> {
  const project = await getProject(projectId);
  const scenes = project.scenes?.scenes ?? [];

  const withAudio = scenes.filter((scene) => scene.audio !== null).length;
  const status =
    scenes.length > 0 && withAudio === scenes.length
      ? "complete"
      : withAudio > 0
        ? "in_progress"
        : "pending";

  if (project.pipeline.voice.status === status) return project;

  const updated = await getProjectRepository().update(projectId, {
    pipeline: {
      ...project.pipeline,
      voice: {
        status,
        updatedAt: status === "pending" ? null : new Date().toISOString(),
      },
    },
    updatedAt: new Date().toISOString(),
  });

  return updated ?? project;
}
