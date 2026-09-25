import { randomUUID } from "node:crypto";
import { NotFoundError } from "@/server/errors";
import { defaultVoiceSettings } from "@/types/voice";
import { DEFAULT_CAPTION_SETTINGS } from "@/types/caption";
import { getProjectRepository } from "@/server/repositories";
import type { ProjectSummary } from "@/server/repositories/project-repository";
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
    posterUrl: null,
    publishedAt: null,
    youtubeUrl: null,
    metadata: [],
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

/** How many projects match, without loading a single lesson or scene. */
export async function countProjects(
  filters: ProjectListFilters = {},
): Promise<number> {
  return getProjectRepository().count(filters);
}

export async function getProjectStats(): Promise<ProjectStats> {
  return summarise(await getProjectRepository().summaries());
}

/**
 * The dashboard.
 *
 * The tiles are computed from a three-column projection rather than from full
 * projects: they are six integers, and loading every lesson, scene, audio row
 * and render job in the library to produce them made the dashboard the most
 * expensive page in the app. The three sections still need real projects, but
 * only a handful each, so they are fetched with a limit.
 */
export async function getDashboardData(): Promise<DashboardData> {
  const repository = getProjectRepository();

  const [summaries, recent, drafts, completed] = await Promise.all([
    repository.summaries(),
    repository.list({ limit: DASHBOARD_SECTION_LIMIT }),
    repository.list({ status: "draft", limit: DASHBOARD_SECTION_LIMIT }),
    repository.list({ status: "completed", limit: DASHBOARD_SECTION_LIMIT }),
  ]);

  // `published` is a separate status but belongs in the same section, and a
  // status filter takes one value — so it is fetched alongside and merged.
  const published = await repository.list({
    status: "published",
    limit: DASHBOARD_SECTION_LIMIT,
  });

  return {
    stats: summarise(summaries),
    recent,
    drafts,
    completed: [...completed, ...published]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, DASHBOARD_SECTION_LIMIT),
  };
}

function summarise(projects: ProjectSummary[]): ProjectStats {
  const countWhere = (predicate: (project: ProjectSummary) => boolean) =>
    projects.reduce((total, project) => total + (predicate(project) ? 1 : 0), 0);

  return {
    videosCreated: projects.length,
    // A "both" project produces each cut, so it counts toward both totals.
    // These therefore overlap and do not sum to `videosCreated`.
    shorts: countWhere((project) => producesShorts(project.format)),
    longVideos: countWhere((project) => producesLongForm(project.format)),
    drafts: countWhere((project) => project.status === "draft"),
    // Everything between a draft and a finished video, whatever stage it
    // stopped at.
    inProgress: countWhere(
      (project) =>
        project.status !== "draft" &&
        project.status !== "completed" &&
        project.status !== "published",
    ),
    completed: countWhere(
      (project) => project.status === "completed" || project.status === "published",
    ),
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
