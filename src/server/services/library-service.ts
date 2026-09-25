import { randomUUID } from "node:crypto";
import { NotFoundError } from "@/server/errors";
import { getProjectRepository } from "@/server/repositories";
import { getProject } from "@/server/services/project-service";
import { syncDerivedState } from "@/server/services/pipeline-service";
import { PIPELINE_STAGES } from "@/types/project";
import type { ProjectPipeline, VideoProject } from "@/types/project";

/**
 * Library actions that act on a whole project rather than one of its stages.
 */

/**
 * Records that the creator published the video.
 *
 * Nothing uploads to YouTube yet, so this is their word rather than something
 * the app observed — which is exactly why it is the one status that is not
 * derived from content. Passing `published: false` takes it back.
 */
export async function setPublished(
  projectId: string,
  published: boolean,
  youtubeUrl?: string | null,
): Promise<VideoProject> {
  const project = await getProject(projectId);

  const updated = await getProjectRepository().update(projectId, {
    publishedAt: published ? (project.publishedAt ?? new Date().toISOString()) : null,
    youtubeUrl: published ? (youtubeUrl ?? project.youtubeUrl) : null,
    updatedAt: new Date().toISOString(),
  });

  if (!updated) {
    throw new NotFoundError(`No project found with id "${projectId}".`);
  }

  return syncDerivedState(updated);
}

/**
 * Copies a project so a lesson can be reworked without losing the original.
 *
 * The creative work is copied — lesson, storyboard, captions, voice settings,
 * metadata. What belongs to the original's *output* is not: renders, generated
 * audio, the publish record, and the preview review all describe something
 * that happened to that video, not to this one. The copy therefore starts as a
 * draft that has to be rendered on its own.
 */
export async function duplicateProject(projectId: string): Promise<VideoProject> {
  const source = await getProject(projectId);
  const now = new Date().toISOString();

  const copy: VideoProject = {
    ...source,
    id: randomUUID(),
    title: copyTitle(source.title),
    // Scenes get new ids so the two storyboards cannot share a row, and no
    // audio: those clips were generated for the original.
    scenes: source.scenes
      ? {
          ...source.scenes,
          scenes: source.scenes.scenes.map((scene) => ({
            ...scene,
            id: randomUUID(),
            audio: null,
          })),
        }
      : null,
    previewReviewedAt: null,
    latestRender: null,
    hasRenderOutput: false,
    posterUrl: null,
    publishedAt: null,
    youtubeUrl: null,
    status: "draft",
    pipeline: emptyPipeline(),
    createdAt: now,
    updatedAt: now,
  };

  const created = await getProjectRepository().create(copy);

  // The copy's real status follows from what was carried over, so it is
  // derived here rather than guessed above.
  return syncDerivedState(created);
}

/** "Thing" → "Thing (copy)" → "Thing (copy 2)". */
function copyTitle(title: string): string {
  const match = /^(.*) \(copy(?: (\d+))?\)$/.exec(title);

  if (!match) return `${title} (copy)`;

  const [, base, count] = match;
  return `${base} (copy ${Number(count ?? 1) + 1})`;
}

function emptyPipeline(): ProjectPipeline {
  return Object.fromEntries(
    PIPELINE_STAGES.map((stage) => [stage, { status: "pending", updatedAt: null }]),
  ) as ProjectPipeline;
}
