import type { StoredLesson } from "@/types/lesson";
import type { StoredScenes } from "@/types/scene";

/**
 * Domain model for a Korean-learning video project.
 *
 * A project moves through the production pipeline:
 *   topic → lesson → scenes → assets → voice → captions → preview →
 *   render → youtube
 *
 * `topic`, `lesson`, and `scenes` are implemented. The remaining stages are
 * modelled so the UI can show real progress as each one is built.
 *
 * There is deliberately no separate "script" stage: a scene's `narration`
 * field is the spoken script, produced by the scene generator and consumed by
 * the future voice stage.
 */

/** "both" produces a Shorts cut and a long-form cut from one lesson. */
export const VIDEO_FORMATS = ["shorts", "long", "both"] as const;
export type VideoFormat = (typeof VIDEO_FORMATS)[number];

export const PROJECT_STATUSES = ["draft", "in_progress", "completed"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROFICIENCY_LEVELS = [
  "beginner",
  "elementary",
  "intermediate",
  "advanced",
] as const;
export type ProficiencyLevel = (typeof PROFICIENCY_LEVELS)[number];

/** Language the lesson is explained in. The Korean being taught is fixed. */
export const TARGET_LANGUAGES = ["korean", "english", "chinese"] as const;
export type TargetLanguage = (typeof TARGET_LANGUAGES)[number];

export const CONTENT_STYLES = [
  "vocabulary",
  "grammar",
  "conversation",
  "pronunciation",
  "quiz",
  "culture",
  "food",
  "travel",
] as const;
export type ContentStyle = (typeof CONTENT_STYLES)[number];

export const VISUAL_STYLES = [
  "clean_educational",
  "korean_lifestyle",
  "cartoon",
  "minimal",
  "realistic",
] as const;
export type VisualStyle = (typeof VISUAL_STYLES)[number];

/** Durations are picked from fixed options, not typed freehand. */
export const SHORTS_DURATION_OPTIONS = [15, 30, 60] as const;
export type ShortsDuration = (typeof SHORTS_DURATION_OPTIONS)[number];

export const LONG_DURATION_OPTIONS = [180, 300, 600] as const;
export type LongDuration = (typeof LONG_DURATION_OPTIONS)[number];

export const PIPELINE_STAGES = [
  "topic",
  "lesson",
  "scenes",
  "assets",
  "voice",
  "captions",
  "preview",
  "render",
  "youtube",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const STAGE_STATUSES = ["pending", "in_progress", "complete"] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export interface StageState {
  status: StageStatus;
  /** ISO 8601 timestamp of the last change, or null if never touched. */
  updatedAt: string | null;
}

export type ProjectPipeline = Record<PipelineStage, StageState>;

export interface VideoProject {
  id: string;
  title: string;
  /** The Korean-learning subject, e.g. "Korean Numbers 1-10". */
  topic: string;
  description: string;
  format: VideoFormat;
  status: ProjectStatus;
  level: ProficiencyLevel;
  targetLanguage: TargetLanguage;
  contentStyle: ContentStyle;
  visualStyle: VisualStyle;
  /** Set when the format produces a Shorts cut, otherwise null. */
  shortsDurationSeconds: ShortsDuration | null;
  /** Set when the format produces a long-form cut, otherwise null. */
  longDurationSeconds: LongDuration | null;
  /** The generated lesson, or null until one has been generated. */
  lesson: StoredLesson | null;
  /** The storyboard built from the lesson, or null until generated. */
  scenes: StoredScenes | null;
  pipeline: ProjectPipeline;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 */
  updatedAt: string;
}

export interface CreateProjectInput {
  topic: string;
  /** Defaults to the topic when omitted. */
  title?: string;
  description?: string;
  format: VideoFormat;
  level: ProficiencyLevel;
  targetLanguage: TargetLanguage;
  contentStyle: ContentStyle;
  visualStyle: VisualStyle;
  shortsDurationSeconds?: ShortsDuration;
  longDurationSeconds?: LongDuration;
}

export interface UpdateProjectInput {
  title?: string;
  topic?: string;
  description?: string;
  format?: VideoFormat;
  level?: ProficiencyLevel;
  status?: ProjectStatus;
  targetLanguage?: TargetLanguage;
  contentStyle?: ContentStyle;
  visualStyle?: VisualStyle;
  shortsDurationSeconds?: ShortsDuration;
  longDurationSeconds?: LongDuration;
}

export interface ProjectListFilters {
  status?: ProjectStatus;
  format?: VideoFormat;
  /** Case-insensitive match against title and topic. */
  search?: string;
}

export interface ProjectStats {
  videosCreated: number;
  /** Projects that produce a Shorts cut, including "both". */
  shorts: number;
  /** Projects that produce a long-form cut, including "both". */
  longVideos: number;
  drafts: number;
  inProgress: number;
  completed: number;
}

export interface DashboardData {
  stats: ProjectStats;
  recent: VideoProject[];
  drafts: VideoProject[];
  completed: VideoProject[];
}

export function producesShorts(format: VideoFormat): boolean {
  return format === "shorts" || format === "both";
}

export function producesLongForm(format: VideoFormat): boolean {
  return format === "long" || format === "both";
}
