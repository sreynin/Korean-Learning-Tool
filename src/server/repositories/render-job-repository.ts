import type { PrismaClient, RenderJob as RenderJobRow } from "@prisma/client";
import { getDb } from "@/server/db/client";
import { ACTIVE_RENDER_STATUSES } from "@/types/render";
import type { RenderFormat, RenderJob, RenderStatus } from "@/types/render";

/**
 * Persistence for render jobs.
 *
 * Every method is a single short statement. Rendering itself must never sit
 * inside one of these calls: SQLite takes a write lock per statement, and
 * holding one for the length of a render would block the rest of the app.
 */
export class RenderJobRepository {
  private readonly db: PrismaClient;

  constructor(db: PrismaClient = getDb()) {
    this.db = db;
  }

  async findById(id: string): Promise<RenderJob | null> {
    const row = await this.db.renderJob.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async listForProject(projectId: string): Promise<RenderJob[]> {
    const rows = await this.db.renderJob.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toDomain);
  }

  async findActiveForProject(projectId: string): Promise<RenderJob | null> {
    const row = await this.db.renderJob.findFirst({
      where: { projectId, status: { in: ACTIVE_RENDER_STATUSES } },
      orderBy: { createdAt: "desc" },
    });
    return row ? toDomain(row) : null;
  }

  /**
   * Creates a job only if the project has no active one.
   *
   * The check and the insert share a transaction so two requests arriving
   * together cannot both pass the check. That is enough protection for a
   * single-process app; a multi-worker deployment would want a unique
   * constraint or a real queue.
   */
  async createIfIdle(
    projectId: string,
    format: RenderFormat,
  ): Promise<RenderJob | null> {
    return this.db.$transaction(async (tx) => {
      const active = await tx.renderJob.findFirst({
        where: { projectId, status: { in: ACTIVE_RENDER_STATUSES } },
        select: { id: true },
      });

      if (active) return null;

      const row = await tx.renderJob.create({
        data: { projectId, format, status: "pending", progress: 0 },
      });

      return toDomain(row);
    });
  }

  async markQueued(id: string): Promise<void> {
    await this.db.renderJob.updateMany({
      where: { id, status: "pending" },
      data: { status: "queued" },
    });
  }

  /**
   * Moves a job to `processing`, but only from a state that has not started.
   * Returns false when someone else already claimed it, which is how two
   * workers avoid rendering the same job twice.
   */
  async claim(id: string): Promise<boolean> {
    const result = await this.db.renderJob.updateMany({
      where: { id, status: { in: ["pending", "queued"] } },
      data: { status: "processing", startedAt: new Date(), errorMessage: null },
    });

    return result.count === 1;
  }

  /** Progress only moves forward, so a late report cannot rewind the bar. */
  async updateProgress(id: string, progress: number): Promise<void> {
    const clamped = Math.min(100, Math.max(0, Math.round(progress)));

    await this.db.renderJob.updateMany({
      where: { id, status: "processing", progress: { lt: clamped } },
      data: { progress: clamped },
    });
  }

  async markCompleted(
    id: string,
    output: {
      fileName: string;
      posterFileName?: string | null;
      contentType: string;
      byteSize: number;
    },
  ): Promise<void> {
    await this.db.renderJob.update({
      where: { id },
      data: {
        status: "completed",
        progress: 100,
        outputFileName: output.fileName,
        posterFileName: output.posterFileName ?? null,
        contentType: output.contentType,
        byteSize: output.byteSize,
        errorMessage: null,
        completedAt: new Date(),
      },
    });
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    await this.db.renderJob.update({
      where: { id },
      data: {
        status: "failed",
        errorMessage: errorMessage.slice(0, 500),
        completedAt: new Date(),
      },
    });
  }

  /**
   * The completed job that produced a given file. Looking the name up here is
   * what stops the serving route reading a file this app never rendered.
   */
  async findCompletedByOutput(fileName: string): Promise<RenderJob | null> {
    const row = await this.db.renderJob.findFirst({
      where: {
        status: "completed",
        // Either the video or the still taken from it; both are served by the
        // same route, and both must belong to a finished job.
        OR: [{ outputFileName: fileName }, { posterFileName: fileName }],
      },
    });
    return row ? toDomain(row) : null;
  }

  /** Jobs a worker should pick up, oldest first. */
  async listClaimable(limit = 10): Promise<RenderJob[]> {
    const rows = await this.db.renderJob.findMany({
      where: { status: { in: ["pending", "queued"] } },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    return rows.map(toDomain);
  }
}

export function toDomain(row: RenderJobRow): RenderJob {
  return {
    id: row.id,
    projectId: row.projectId,
    format: row.format as RenderFormat,
    status: row.status as RenderStatus,
    progress: row.progress,
    errorMessage: row.errorMessage,
    outputUrl: row.outputFileName ? `/api/renders/${row.outputFileName}` : null,
    posterUrl: row.posterFileName ? `/api/renders/${row.posterFileName}` : null,
    contentType: row.contentType,
    byteSize: row.byteSize,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

/** Cached on `globalThis` so hot reloads reuse the instance, as storage is. */
const globalForRenderJobs = globalThis as unknown as {
  __renderJobRepository?: RenderJobRepository;
};

export function getRenderJobRepository(): RenderJobRepository {
  if (!globalForRenderJobs.__renderJobRepository) {
    globalForRenderJobs.__renderJobRepository = new RenderJobRepository();
  }
  return globalForRenderJobs.__renderJobRepository;
}
