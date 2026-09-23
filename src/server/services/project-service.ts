import { randomUUID } from "node:crypto";
import { NotFoundError } from "@/server/errors";
import { defaultVoiceSettings } from "@/types/voice";
import { DEFAULT_CAPTION_SETTINGS } from "@/types/caption";
import { getProjectRepository } from "@/server/repositories";
import {
  PIPELINE_STAGES,
  producesLongForm,
  producesShorts,
} from "@/types/project";
import type {
  CreateProjectInput,
  DashboardData,
  LongDuration,
  ProjectListFilters,
  ProjectPipeline,
  ProjectStats,
  ShortsDuration,
  UpdateProjectInput,
  VideoProject,
} from "@/types/project";

const DEFAULT_SHORTS_DURATION: ShortsDuration = 30;
const DEFAULT_LONG_DURATION: LongDuration = 300;

const DASHBOARD_SECTION_LIMIT = 4;

export async function listProjects(
  filters: ProjectListFilters = {},
): Promise<VideoProject[]> {
  return getProjectRepository().list(filters);
}

export async function getProject(id: string): Promise<VideoProject> {
  const project = await getProjectRepository().findById(id);
  if (!project) {
    throw new NotFoundError(`No project found with id "${id}".`);
  }
  return project;
}

export async function createProject(
  input: CreateProjectInput,
): Promise<VideoProject> {
  const now = new Date().toISOString();

  const project: VideoProject = {
    id: randomUUID(),
    // The form collects a topic; the title starts as a copy and can diverge
    // later when YouTube metadata is generated.
    title: input.title ?? input.topic,
    topic: input.topic,
    description: input.description ?? "",
    format: input.format,
    level: input.level,
    targetLanguage: input.targetLanguage,
    contentStyle: input.contentStyle,
    visualStyle: input.visualStyle,
    status: "draft",
    shortsDurationSeconds: producesShorts(input.format)
      ? (input.shortsDurationSeconds ?? DEFAULT_SHORTS_DURATION)
      : null,
    longDurationSeconds: producesLongForm(input.format)
      ? (input.longDurationSeconds ?? DEFAULT_LONG_DURATION)
      : null,
    lesson: null,
    scenes: null,
    captionSettings: DEFAULT_CAPTION_SETTINGS,
    captionsConfigured: false,
    previewReviewedAt: null,
    latestRender: null,
    hasRenderOutput: false,
    voiceSettings: defaultVoiceSettings(
      input.targetLanguage === "korean" ? "korean" : "english",
    ),
    pipeline: createInitialPipeline(now),
    createdAt: now,
    updatedAt: now,
  };

  return getProjectRepository().create(project);
}

export async function updateProject(
  id: string,
  input: UpdateProjectInput,
): Promise<VideoProject> {
  const existing = await getProject(id);
  const format = input.format ?? existing.format;

  // Durations must match whatever the format now produces: dropping a cut
  // clears its length, adding one falls back to the default.
  const shortsDurationSeconds = producesShorts(format)
    ? (input.shortsDurationSeconds ??
      existing.shortsDurationSeconds ??
      DEFAULT_SHORTS_DURATION)
    : null;

  const longDurationSeconds = producesLongForm(format)
    ? (input.longDurationSeconds ??
      existing.longDurationSeconds ??
      DEFAULT_LONG_DURATION)
    : null;

  const updated = await getProjectRepository().update(id, {
    ...input,
    format,
    shortsDurationSeconds,
    longDurationSeconds,
    updatedAt: new Date().toISOString(),
  });

  if (!updated) {
    throw new NotFoundError(`No project found with id "${id}".`);
  }
  return updated;
}

export async function deleteProject(id: string): Promise<void> {
  const deleted = await getProjectRepository().delete(id);
  if (!deleted) {
    throw new NotFoundError(`No project found with id "${id}".`);
  }
}

export async function getProjectStats(): Promise<ProjectStats> {
  const projects = await listProjects();
  return summarise(projects);
}

export async function getDashboardData(): Promise<DashboardData> {
  const projects = await listProjects();

  return {
    stats: summarise(projects),
    recent: projects.slice(0, DASHBOARD_SECTION_LIMIT),
    drafts: projects
      .filter((project) => project.status === "draft")
      .slice(0, DASHBOARD_SECTION_LIMIT),
    completed: projects
      .filter((project) => project.status === "completed")
      .slice(0, DASHBOARD_SECTION_LIMIT),
  };
}

function summarise(projects: VideoProject[]): ProjectStats {
  const countWhere = (predicate: (project: VideoProject) => boolean) =>
    projects.reduce((total, project) => total + (predicate(project) ? 1 : 0), 0);

  return {
    videosCreated: projects.length,
    // A "both" project produces each cut, so it counts toward both totals.
    // These therefore overlap and do not sum to `videosCreated`.
    shorts: countWhere((project) => producesShorts(project.format)),
    longVideos: countWhere((project) => producesLongForm(project.format)),
    drafts: countWhere((project) => project.status === "draft"),
    inProgress: countWhere((project) => project.status === "in_progress"),
    completed: countWhere((project) => project.status === "completed"),
  };
}

/** A brand new project has only chosen its topic; everything else is pending. */
function createInitialPipeline(now: string): ProjectPipeline {
  return Object.fromEntries(
    PIPELINE_STAGES.map((stage) => [
      stage,
      stage === "topic"
        ? { status: "complete", updatedAt: now }
        : { status: "pending", updatedAt: null },
    ]),
  ) as ProjectPipeline;
}
