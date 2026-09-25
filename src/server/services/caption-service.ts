import { ConflictError, NotFoundError } from "@/server/errors";
import { getProjectRepository } from "@/server/repositories";
import { getProject } from "@/server/services/project-service";
import { syncDerivedState } from "@/server/services/pipeline-service";
import type { CaptionSettings } from "@/types/caption";
import type { VideoProject } from "@/types/project";

/**
 * Saving caption settings is what completes the captions stage: it is the
 * point at which caption configuration is actually stored. Until then the
 * project renders with defaults, which is not the same as being configured.
 */
export async function updateCaptionSettings(
  projectId: string,
  captionSettings: CaptionSettings,
): Promise<VideoProject> {
  await getProject(projectId);

  const updated = await getProjectRepository().update(projectId, {
    captionSettings,
    captionsConfigured: true,
    updatedAt: new Date().toISOString(),
  });

  if (!updated) {
    throw new NotFoundError(`No project found with id "${projectId}".`);
  }

  return syncDerivedState(updated);
}

/**
 * Records that the creator has watched the preview through. There is no
 * artifact to check, so this is an explicit action rather than something
 * inferred from a page view.
 */
export async function setPreviewReviewed(
  projectId: string,
  reviewed: boolean,
): Promise<VideoProject> {
  const project = await getProject(projectId);

  if (reviewed && (project.scenes?.scenes.length ?? 0) === 0) {
    throw new ConflictError(
      "There is no storyboard to preview yet, so it cannot be marked reviewed.",
    );
  }

  const updated = await getProjectRepository().update(projectId, {
    previewReviewedAt: reviewed ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
  });

  if (!updated) {
    throw new NotFoundError(`No project found with id "${projectId}".`);
  }

  return syncDerivedState(updated);
}
