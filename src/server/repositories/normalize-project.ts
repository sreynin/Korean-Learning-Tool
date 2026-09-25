import {
  LONG_DURATION_OPTIONS,
  PIPELINE_STAGES,
  SHORTS_DURATION_OPTIONS,
  producesLongForm,
  producesShorts,
} from "@/types/project";
import { defaultVoiceSettings } from "@/types/voice";
import { DEFAULT_CAPTION_SETTINGS } from "@/types/caption";
import type {
  PipelineStage,
  ProjectPipeline,
  StageState,
  VideoProject,
} from "@/types/project";

/**
 * Brings a stored record up to the current shape.
 *
 * Version 1 had a single free-form `targetDurationSeconds` and no target
 * language, content style, or visual style. Version 2 had a different set of
 * pipeline stages. Rather than failing on an older store, fill the gaps with
 * the same defaults the create form uses.
 */
export function normalizeProject(raw: VideoProject): VideoProject {
  const legacy = raw as VideoProject & { targetDurationSeconds?: number };
  const { targetDurationSeconds, ...project } = legacy;

  return {
    ...project,
    pipeline: normalizePipeline(project.pipeline),
    targetLanguage: project.targetLanguage ?? "korean",
    contentStyle: project.contentStyle ?? "vocabulary",
    visualStyle: project.visualStyle ?? "clean_educational",
    lesson: project.lesson ?? null,
    scenes: project.scenes ?? null,
    captionSettings: project.captionSettings ?? DEFAULT_CAPTION_SETTINGS,
    captionsConfigured: project.captionsConfigured ?? false,
    previewReviewedAt: project.previewReviewedAt ?? null,
    latestRender: project.latestRender ?? null,
    hasRenderOutput: project.hasRenderOutput ?? false,
    posterUrl: project.posterUrl ?? null,
    publishedAt: project.publishedAt ?? null,
    youtubeUrl: project.youtubeUrl ?? null,
    metadata: project.metadata ?? [],
    voiceSettings:
      project.voiceSettings ??
      defaultVoiceSettings(project.targetLanguage === "korean" ? "korean" : "english"),
    shortsDurationSeconds: producesShorts(project.format)
      ? (project.shortsDurationSeconds ??
        nearest(targetDurationSeconds, SHORTS_DURATION_OPTIONS))
      : null,
    longDurationSeconds: producesLongForm(project.format)
      ? (project.longDurationSeconds ??
        nearest(targetDurationSeconds, LONG_DURATION_OPTIONS))
      : null,
  };
}

/**
 * Version 2 stages that were renamed. Their recorded status carries over so a
 * project does not appear to lose progress.
 */
const RENAMED_STAGES: Record<string, PipelineStage> = {
  visuals: "assets",
  export: "render",
};

const PENDING: StageState = { status: "pending", updatedAt: null };

/**
 * Rebuilds the pipeline against the current stage list.
 *
 * The removed "script" stage is dropped: a scene's `narration` is the spoken
 * script, so there is nothing for a separate stage to own. Any stage missing
 * from an older record defaults to pending, which guarantees every key in
 * `PIPELINE_STAGES` exists — the UI indexes the pipeline by stage directly.
 */
export function normalizePipeline(
  raw: Record<string, StageState> | undefined,
): ProjectPipeline {
  const stored = raw ?? {};
  const carried = new Map<PipelineStage, StageState>();

  for (const [key, state] of Object.entries(stored)) {
    const stage = (RENAMED_STAGES[key] ?? key) as PipelineStage;
    if (PIPELINE_STAGES.includes(stage) && state) {
      carried.set(stage, state);
    }
  }

  return Object.fromEntries(
    PIPELINE_STAGES.map((stage) => [stage, carried.get(stage) ?? PENDING]),
  ) as ProjectPipeline;
}

/** Snaps a legacy free-form duration onto the closest allowed option. */
function nearest<T extends number>(
  seconds: number | undefined,
  options: readonly [T, ...T[]],
): T {
  if (seconds === undefined) return options[0];

  return options.reduce((closest, option) =>
    Math.abs(option - seconds) < Math.abs(closest - seconds) ? option : closest,
  );
}
