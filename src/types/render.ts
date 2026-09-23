/**
 * Render jobs.
 *
 * A render is far longer than lesson or scene generation, so it does not run
 * inside the HTTP request. The request creates a job row and returns; a worker
 * picks it up. The row is the whole contract between the two, which is what
 * lets the worker move to a separate process — or a real queue — later without
 * touching the API.
 */

export const RENDER_STATUSES = [
  "pending",
  "queued",
  "processing",
  "completed",
  "failed",
] as const;
export type RenderStatus = (typeof RENDER_STATUSES)[number];

/** Statuses that mean a job still owns the project's render slot. */
export const ACTIVE_RENDER_STATUSES: RenderStatus[] = [
  "pending",
  "queued",
  "processing",
];

export interface RenderJob {
  id: string;
  projectId: string;
  status: RenderStatus;
  /** 0-100. */
  progress: number;
  errorMessage: string | null;
  /** Serving URL for the finished file, or null. */
  outputUrl: string | null;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601, set when a worker claims the job. */
  startedAt: string | null;
  /** ISO 8601, set on success or failure. */
  completedAt: string | null;
}

export function isActiveRender(status: RenderStatus): boolean {
  return ACTIVE_RENDER_STATUSES.includes(status);
}

export function isRenderFinished(status: RenderStatus): boolean {
  return status === "completed" || status === "failed";
}
