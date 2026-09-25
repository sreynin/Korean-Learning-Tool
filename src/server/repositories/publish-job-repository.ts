import type { PrismaClient, PublishJob as PublishJobRow } from "@prisma/client";
import { getDb } from "@/server/db/client";
import { ACTIVE_PUBLISH_STATUSES } from "@/types/youtube";
import type {
  PublishFormat,
  PublishJob,
  PublishSettings,
  PublishStatus,
  ThumbnailSource,
  YouTubeVisibility,
} from "@/types/youtube";

/**
 * Persistence for publish jobs.
 *
 * Every method is one short statement, for the same reason the render job
 * repository is: SQLite takes a write lock per statement, and an upload must
 * never sit inside one. `runPublishJob()` holds no transaction while bytes are
 * going to YouTube.
 */
export class PublishJobRepository {
  private readonly db: PrismaClient;

  constructor(db: PrismaClient = getDb()) {
    this.db = db;
  }

  async findById(id: string): Promise<PublishJob | null> {
    const row = await this.db.publishJob.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async listForProject(projectId: string): Promise<PublishJob[]> {
    const rows = await this.db.publishJob.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toDomain);
  }

  async findActiveForProject(projectId: string): Promise<PublishJob | null> {
    const row = await this.db.publishJob.findFirst({
      where: { projectId, status: { in: ACTIVE_PUBLISH_STATUSES } },
      orderBy: { createdAt: "desc" },
    });
    return row ? toDomain(row) : null;
  }

  /** The most recent job that actually produced a video, if any. */
  async findLatestPublished(projectId: string): Promise<PublishJob | null> {
    const row = await this.db.publishJob.findFirst({
      where: { projectId, status: "completed", videoId: { not: null } },
      orderBy: { completedAt: "desc" },
    });
    return row ? toDomain(row) : null;
  }

  /**
   * Creates a job only if the project has no active one.
   *
   * The check and the insert share a transaction, so two clicks arriving
   * together cannot both pass — which for publishing matters more than it does
   * for rendering: two winners would upload the same video to YouTube twice.
   */
  async createIfIdle(options: {
    projectId: string;
    format: PublishFormat;
    settings: PublishSettings;
    provider: string;
  }): Promise<PublishJob | null> {
    const { projectId, format, settings, provider } = options;

    return this.db.$transaction(async (tx) => {
      const active = await tx.publishJob.findFirst({
        where: { projectId, status: { in: ACTIVE_PUBLISH_STATUSES } },
        select: { id: true },
      });

      if (active) return null;

      const row = await tx.publishJob.create({
        data: {
          projectId,
          format,
          provider,
          status: "pending",
          progress: 0,
          title: settings.title,
          description: settings.description,
          tags: JSON.stringify(settings.tags),
          visibility: settings.visibility,
          categoryId: settings.categoryId,
          language: settings.language,
          thumbnail: settings.thumbnail,
        },
      });

      return toDomain(row);
    });
  }

  async markQueued(id: string): Promise<void> {
    await this.db.publishJob.updateMany({
      where: { id, status: "pending" },
      data: { status: "queued" },
    });
  }

  /**
   * Moves a job to `uploading`, but only from a state that has not started.
   * Returns false when someone else claimed it first — the guard that stops
   * two workers uploading the same video.
   */
  async claim(id: string): Promise<boolean> {
    const result = await this.db.publishJob.updateMany({
      where: { id, status: { in: ["pending", "queued"] } },
      data: { status: "uploading", startedAt: new Date(), errorMessage: null },
    });

    return result.count === 1;
  }

  /** Progress only moves forward, so a late chunk cannot rewind the bar. */
  async updateProgress(id: string, progress: number): Promise<void> {
    const clamped = Math.min(100, Math.max(0, Math.round(progress)));

    await this.db.publishJob.updateMany({
      where: { id, status: "uploading", progress: { lt: clamped } },
      data: { progress: clamped },
    });
  }

  /**
   * The bytes are gone; YouTube is transcoding.
   *
   * The video id is recorded **here**, before processing finishes, because
   * from this moment the video exists on the channel. A job that dies during
   * processing must still be able to say which video it created, or the
   * creator is left with an untracked upload.
   */
  async markProcessing(id: string, video: {
    videoId: string;
    videoUrl: string;
    publishedAt: string;
    visibility: YouTubeVisibility;
  }): Promise<void> {
    await this.db.publishJob.update({
      where: { id },
      data: {
        status: "processing",
        progress: 100,
        videoId: video.videoId,
        videoUrl: video.videoUrl,
        publishedAt: new Date(video.publishedAt),
        visibility: video.visibility,
      },
    });
  }

  async markCompleted(id: string): Promise<void> {
    await this.db.publishJob.update({
      where: { id },
      data: { status: "completed", progress: 100, completedAt: new Date() },
    });
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    await this.db.publishJob.update({
      where: { id },
      data: {
        status: "failed",
        errorMessage: errorMessage.slice(0, 500),
        completedAt: new Date(),
      },
    });
  }

  async setWarning(id: string, warningMessage: string): Promise<void> {
    await this.db.publishJob.update({
      where: { id },
      data: { warningMessage: warningMessage.slice(0, 500) },
    });
  }

  /** Jobs a worker should pick up, oldest first. */
  async listClaimable(limit = 10): Promise<PublishJob[]> {
    const rows = await this.db.publishJob.findMany({
      where: { status: { in: ["pending", "queued"] } },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    return rows.map(toDomain);
  }
}

export function toDomain(row: PublishJobRow): PublishJob {
  const visibility = row.visibility as YouTubeVisibility;

  return {
    id: row.id,
    projectId: row.projectId,
    format: row.format as PublishFormat,
    status: row.status as PublishStatus,
    progress: row.progress,
    errorMessage: row.errorMessage,
    warningMessage: row.warningMessage,
    settings: {
      title: row.title,
      description: row.description,
      tags: parseTags(row.tags),
      visibility,
      categoryId: row.categoryId,
      language: row.language,
      thumbnail: row.thumbnail as ThumbnailSource,
    },
    publication:
      row.videoId && row.videoUrl
        ? {
            videoId: row.videoId,
            videoUrl: row.videoUrl,
            publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
            visibility,
            projectId: row.projectId,
          }
        : null,
    provider: row.provider,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function parseTags(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

const globalForPublishJobs = globalThis as unknown as {
  __publishJobRepository?: PublishJobRepository;
};

export function getPublishJobRepository(): PublishJobRepository {
  if (!globalForPublishJobs.__publishJobRepository) {
    globalForPublishJobs.__publishJobRepository = new PublishJobRepository();
  }
  return globalForPublishJobs.__publishJobRepository;
}
