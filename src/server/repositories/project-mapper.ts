import type {
  Lesson,
  Metadata as MetadataRow,
  Project,
  RenderJob as RenderJobRow,
  Scene,
  SceneAudio as SceneAudioRow,
  Storyboard,
} from "@prisma/client";
import { toDomain as toRenderJob } from "@/server/repositories/render-job-repository";
import { normalizePipeline } from "@/server/repositories/normalize-project";
import type { LessonSection, QuizQuestion, StoredLesson } from "@/types/lesson";
import type { MetadataFormat, StoredMetadata } from "@/types/metadata";
import type {
  ContentStyle,
  ProficiencyLevel,
  ProjectStatus,
  TargetLanguage,
  VideoFormat,
  VideoProject,
  VisualStyle,
} from "@/types/project";
import type {
  SceneAnimation,
  SceneTransition,
  SceneType,
  StoredScenes,
} from "@/types/scene";
import { defaultVoiceSettings } from "@/types/voice";
import { DEFAULT_CAPTION_SETTINGS } from "@/types/caption";
import type { CaptionSettings } from "@/types/caption";
import type { SceneAudio, VoiceLanguage, VoiceSettings } from "@/types/voice";
import type { LongDuration, ShortsDuration } from "@/types/project";

/** A project row with everything the domain object needs. */
export type SceneRow = Scene & { audio: SceneAudioRow | null };

export type ProjectRow = Project & {
  lesson: Lesson | null;
  storyboard: (Storyboard & { scenes: SceneRow[] }) | null;
  renderJobs: RenderJobRow[];
  metadata: MetadataRow[];
};

/**
 * Converts a database row into the domain shape the API already returns.
 *
 * The enum-like columns are plain strings in SQLite. They are cast rather than
 * re-validated because every write path runs Zod first — the database is not a
 * second validation boundary.
 */
export function toDomain(row: ProjectRow): VideoProject {
  return {
    id: row.id,
    title: row.title,
    topic: row.topic,
    description: row.description,
    format: row.format as VideoFormat,
    status: row.status as ProjectStatus,
    level: row.level as ProficiencyLevel,
    targetLanguage: row.targetLanguage as TargetLanguage,
    contentStyle: row.contentStyle as ContentStyle,
    visualStyle: row.visualStyle as VisualStyle,
    shortsDurationSeconds: row.shortsDurationSeconds as ShortsDuration | null,
    longDurationSeconds: row.longDurationSeconds as LongDuration | null,
    lesson: row.lesson ? toStoredLesson(row.lesson) : null,
    scenes: row.storyboard ? toStoredScenes(row.storyboard) : null,
    voiceSettings: toVoiceSettings(row.voiceSettings, row.targetLanguage),
    captionSettings: {
      ...DEFAULT_CAPTION_SETTINGS,
      ...parseJson<Partial<CaptionSettings>>(row.captionSettings ?? "", {}),
    },
    // The raw column is null until the creator saves, which is what makes the
    // captions stage derivable rather than assumed.
    captionsConfigured: row.captionSettings !== null,
    previewReviewedAt: row.previewReviewedAt?.toISOString() ?? null,
    latestRender: row.renderJobs[0] ? toRenderJob(row.renderJobs[0]) : null,
    hasRenderOutput: row.renderJobs.some(
      (job) => job.status === "completed" && job.outputFileName !== null,
    ),
    // Newest first, so this is the most recent finished render's still.
    posterUrl: posterUrlOf(row.renderJobs),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    youtubeUrl: row.youtubeUrl,
    metadata: row.metadata.map(toStoredMetadata),
    pipeline: normalizePipeline(parseJson(row.pipeline, {})),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toStoredLesson(row: Lesson): StoredLesson {
  return {
    content: {
      title: row.title,
      hook: row.hook,
      learning_objective: row.learningObjective,
      level: row.level,
      language: row.language,
      sections: parseJson<LessonSection[]>(row.sections, []),
      quiz: parseJson<QuizQuestion[]>(row.quiz, []),
    },
    generatedAt: row.generatedAt.toISOString(),
    model: row.model,
    editedAt: row.editedAt?.toISOString() ?? null,
  };
}

function toStoredScenes(row: Storyboard & { scenes: SceneRow[] }): StoredScenes {
  return {
    scenes: [...row.scenes]
      .sort((a, b) => a.order - b.order)
      .map((scene) => ({
        id: scene.id,
        order: scene.order,
        type: scene.type as SceneType,
        duration: scene.duration,
        koreanText: scene.koreanText,
        englishText: scene.englishText,
        romanization: scene.romanization,
        narration: scene.narration,
        visualPrompt: scene.visualPrompt,
        animation: scene.animation as SceneAnimation,
        background: scene.background,
        transition: scene.transition as SceneTransition,
        highlightTerms: parseJson<string[]>(scene.highlightTerms ?? "", []),
        audio: scene.audio ? toSceneAudio(scene.audio) : null,
      })),
    generatedAt: row.generatedAt.toISOString(),
    model: row.model,
    editedAt: row.editedAt?.toISOString() ?? null,
  };
}

function posterUrlOf(jobs: RenderJobRow[]): string | null {
  const poster = jobs.find(
    (job) => job.status === "completed" && job.posterFileName !== null,
  )?.posterFileName;

  return poster ? `/api/renders/${poster}` : null;
}

function toStoredMetadata(row: MetadataRow): StoredMetadata {
  return {
    format: row.format as MetadataFormat,
    content: {
      title: row.title,
      description: row.description,
      hashtags: parseJson<string[]>(row.hashtags, []),
      tags: parseJson<string[]>(row.tags, []),
      thumbnailText: row.thumbnailText,
      pinnedComment: row.pinnedComment,
    },
    generatedAt: row.generatedAt.toISOString(),
    model: row.model,
    editedAt: row.editedAt?.toISOString() ?? null,
  };
}

/**
 * The stored language may be one the voice providers do not offer (Chinese),
 * so fall back rather than hand the UI a value it cannot render.
 */
function toVoiceSettings(raw: string | null, targetLanguage: string): VoiceSettings {
  const fallbackLanguage: VoiceLanguage =
    targetLanguage === "korean" ? "korean" : "english";

  if (!raw) return defaultVoiceSettings(fallbackLanguage);

  const parsed = parseJson<Partial<VoiceSettings>>(raw, {});
  const base = defaultVoiceSettings(
    parsed.language === "korean" || parsed.language === "english"
      ? parsed.language
      : fallbackLanguage,
  );

  return {
    language: base.language,
    voiceId: parsed.voiceId ?? base.voiceId,
    speed: parsed.speed ?? base.speed,
    pitch: parsed.pitch ?? base.pitch,
    volume: parsed.volume ?? base.volume,
  };
}

function toSceneAudio(row: SceneAudioRow): SceneAudio {
  return {
    // Served by the audio route, never a filesystem path.
    url: `/api/audio/${row.fileName}`,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    durationSeconds: row.durationSeconds,
    settings: {
      language: row.language as VoiceLanguage,
      voiceId: row.voiceId,
      speed: row.speed,
      pitch: row.pitch,
      volume: row.volume,
    },
    voiceName: row.voiceName,
    provider: row.provider,
    generatedAt: row.generatedAt.toISOString(),
  };
}

/** Scalar project columns, for create and update. */
export function toProjectColumns(project: VideoProject) {
  return {
    title: project.title,
    topic: project.topic,
    description: project.description,
    format: project.format,
    status: project.status,
    level: project.level,
    targetLanguage: project.targetLanguage,
    contentStyle: project.contentStyle,
    visualStyle: project.visualStyle,
    shortsDurationSeconds: project.shortsDurationSeconds,
    longDurationSeconds: project.longDurationSeconds,
    pipeline: JSON.stringify(project.pipeline),
    voiceSettings: JSON.stringify(project.voiceSettings),
    // Only persist settings once configured, so the null stays meaningful.
    captionSettings: project.captionsConfigured
      ? JSON.stringify(project.captionSettings)
      : null,
    previewReviewedAt: project.previewReviewedAt
      ? new Date(project.previewReviewedAt)
      : null,
    publishedAt: project.publishedAt ? new Date(project.publishedAt) : null,
    youtubeUrl: project.youtubeUrl,
    createdAt: new Date(project.createdAt),
    updatedAt: new Date(project.updatedAt),
  };
}

export function toMetadataColumns(stored: StoredMetadata) {
  return {
    format: stored.format,
    title: stored.content.title,
    description: stored.content.description,
    hashtags: JSON.stringify(stored.content.hashtags),
    tags: JSON.stringify(stored.content.tags),
    thumbnailText: stored.content.thumbnailText,
    pinnedComment: stored.content.pinnedComment,
    generatedAt: new Date(stored.generatedAt),
    model: stored.model,
    editedAt: stored.editedAt ? new Date(stored.editedAt) : null,
  };
}

export function toLessonColumns(stored: StoredLesson) {
  return {
    title: stored.content.title,
    hook: stored.content.hook,
    learningObjective: stored.content.learning_objective,
    level: stored.content.level,
    language: stored.content.language,
    sections: JSON.stringify(stored.content.sections),
    quiz: JSON.stringify(stored.content.quiz),
    generatedAt: new Date(stored.generatedAt),
    model: stored.model,
    editedAt: stored.editedAt ? new Date(stored.editedAt) : null,
  };
}

export function toStoryboardColumns(stored: StoredScenes) {
  return {
    generatedAt: new Date(stored.generatedAt),
    model: stored.model,
    editedAt: stored.editedAt ? new Date(stored.editedAt) : null,
  };
}

export function toSceneColumns(scene: StoredScenes["scenes"][number]) {
  return {
    id: scene.id,
    order: scene.order,
    type: scene.type,
    duration: scene.duration,
    koreanText: scene.koreanText,
    englishText: scene.englishText,
    romanization: scene.romanization,
    narration: scene.narration,
    visualPrompt: scene.visualPrompt,
    animation: scene.animation,
    background: scene.background,
    transition: scene.transition,
    highlightTerms: JSON.stringify(scene.highlightTerms ?? []),
  };
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
