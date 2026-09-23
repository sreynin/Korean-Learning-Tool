import { formatDuration } from "@/lib/utils/format";
import { PIPELINE_STAGES } from "@/types/project";
import type { VideoProject } from "@/types/project";

export const TOTAL_PIPELINE_STAGES = PIPELINE_STAGES.length;

export function countCompletedStages(project: VideoProject): number {
  return PIPELINE_STAGES.reduce(
    (total, stage) =>
      total + (project.pipeline[stage].status === "complete" ? 1 : 0),
    0,
  );
}

/**
 * Human-readable target length. A "both" project has two, shown together as
 * "0:30 Short · 5:00 long".
 */
export function formatProjectDuration(project: VideoProject): string {
  const parts: string[] = [];

  if (project.shortsDurationSeconds !== null) {
    parts.push(`${formatDuration(project.shortsDurationSeconds)} Short`);
  }
  if (project.longDurationSeconds !== null) {
    parts.push(`${formatDuration(project.longDurationSeconds)} long`);
  }

  return parts.join(" · ") || "No length set";
}
