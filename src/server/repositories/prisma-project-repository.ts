import type { PrismaClient } from "@prisma/client";
import { getDb } from "@/server/db/client";
import {
  toDomain,
  toLessonColumns,
  toProjectColumns,
  toSceneColumns,
  toMetadataColumns,
  toStoryboardColumns,
} from "@/server/repositories/project-mapper";
import type {
  ProjectRepository,
  ProjectSummary,
} from "@/server/repositories/project-repository";
import type { ProjectListFilters, VideoProject } from "@/types/project";

/** Everything the domain object needs, in one query. */
const INCLUDE_RELATIONS = {
  lesson: true,
  storyboard: { include: { scenes: { include: { audio: true } } } },
  // Newest first, so the mapper can take the latest without another query.
  renderJobs: { orderBy: { createdAt: "desc" } },
  metadata: true,
} as const;

/**
 * Prisma-backed store. Lessons and storyboards are separate tables, so writing
 * a project plus its children is done in a transaction — a half-written
 * storyboard would leave scenes without their provenance row.
 */
export class PrismaProjectRepository implements ProjectRepository {
  private readonly db: PrismaClient;

  constructor(db: PrismaClient = getDb()) {
    this.db = db;
  }

  async list(filters: ProjectListFilters = {}): Promise<VideoProject[]> {
    const rows = await this.db.project.findMany({
      where: this.whereFrom(filters),
      include: INCLUDE_RELATIONS,
      orderBy: { updatedAt: "desc" },
      ...(filters.limit ? { take: filters.limit } : {}),
    });

    return rows.map(toDomain);
  }

  /** The same `where` as `list`, so a count can never drift from a listing. */
  private whereFrom(filters: ProjectListFilters) {
    const search = filters.search?.trim();

    return {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.format ? { format: filters.format } : {}),
      ...(filters.level ? { level: filters.level } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search } },
              { topic: { contains: search } },
            ],
          }
        : {}),
    };
  }

  async count(filters: ProjectListFilters = {}): Promise<number> {
    return this.db.project.count({ where: this.whereFrom(filters) });
  }

  async summaries(): Promise<ProjectSummary[]> {
    return this.db.project.findMany({
      select: { id: true, format: true, status: true },
      orderBy: { updatedAt: "desc" },
    }) as Promise<ProjectSummary[]>;
  }

  async findById(id: string): Promise<VideoProject | null> {
    const row = await this.db.project.findUnique({
      where: { id },
      include: INCLUDE_RELATIONS,
    });

    return row ? toDomain(row) : null;
  }

  async create(project: VideoProject): Promise<VideoProject> {
    await this.db.project.create({
      data: { id: project.id, ...toProjectColumns(project) },
    });

    // A newly created project never carries a lesson or storyboard, but write
    // them anyway so this stays correct if that ever changes.
    if (project.lesson || project.scenes) {
      await this.writeChildren(project);
    }

    return (await this.findById(project.id)) ?? project;
  }

  async update(
    id: string,
    changes: Partial<VideoProject>,
  ): Promise<VideoProject | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const merged: VideoProject = { ...existing, ...changes, id };

    await this.db.$transaction(async (tx) => {
      await tx.project.update({
        where: { id },
        data: toProjectColumns(merged),
      });

      await this.writeChildren(merged, tx);
    });

    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    // Lesson, storyboard, and scenes cascade from the schema.
    const result = await this.db.project.deleteMany({ where: { id } });
    return result.count > 0;
  }

  /**
   * Replaces the lesson and storyboard wholesale. Both are small and always
   * saved as a unit, so a delete-and-recreate is simpler and cheaper to reason
   * about than diffing scene rows.
   */
  private async writeChildren(
    project: VideoProject,
    client: PrismaTransaction = this.db,
  ): Promise<void> {
    // Metadata is upserted per cut: a project carries at most one document per
    // format, and regenerating the Short's title must not disturb the
    // long-form one.
    for (const stored of project.metadata) {
      const columns = toMetadataColumns(stored);
      await client.metadata.upsert({
        where: {
          projectId_format: { projectId: project.id, format: stored.format },
        },
        create: { projectId: project.id, ...columns },
        update: columns,
      });
    }

    await client.lesson.deleteMany({ where: { projectId: project.id } });
    if (project.lesson) {
      await client.lesson.create({
        data: { projectId: project.id, ...toLessonColumns(project.lesson) },
      });
    }

    if (!project.scenes) {
      // Cascades to scenes and their audio, which is correct here: the
      // storyboard is gone.
      await client.storyboard.deleteMany({ where: { projectId: project.id } });
      return;
    }

    // Scenes are upserted rather than recreated. Recreating them would cascade
    // away each scene's generated audio every time anything on the project was
    // saved — including a lesson edit that never touched the storyboard.
    const storyboard = await client.storyboard.upsert({
      where: { projectId: project.id },
      create: { projectId: project.id, ...toStoryboardColumns(project.scenes) },
      update: toStoryboardColumns(project.scenes),
    });

    const keptIds = project.scenes.scenes.map((scene) => scene.id);
    await client.scene.deleteMany({
      where: { storyboardId: storyboard.id, id: { notIn: keptIds } },
    });

    for (const scene of project.scenes.scenes) {
      const columns = toSceneColumns(scene);
      await client.scene.upsert({
        where: { id: scene.id },
        create: { ...columns, storyboardId: storyboard.id },
        update: columns,
      });
    }
  }
}

type PrismaTransaction = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;
