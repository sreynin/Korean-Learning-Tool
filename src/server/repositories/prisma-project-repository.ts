import type { PrismaClient } from "@prisma/client";
import { getDb } from "@/server/db/client";
import {
  toDomain,
  toLessonColumns,
  toProjectColumns,
  toSceneColumns,
  toStoryboardColumns,
} from "@/server/repositories/project-mapper";
import type { ProjectRepository } from "@/server/repositories/project-repository";
import type { ProjectListFilters, VideoProject } from "@/types/project";

/** Everything the domain object needs, in one query. */
const INCLUDE_RELATIONS = {
  lesson: true,
  storyboard: { include: { scenes: true } },
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
    const search = filters.search?.trim();

    const rows = await this.db.project.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.format ? { format: filters.format } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search } },
                { topic: { contains: search } },
              ],
            }
          : {}),
      },
      include: INCLUDE_RELATIONS,
      orderBy: { updatedAt: "desc" },
    });

    return rows.map(toDomain);
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
    await client.lesson.deleteMany({ where: { projectId: project.id } });
    if (project.lesson) {
      await client.lesson.create({
        data: { projectId: project.id, ...toLessonColumns(project.lesson) },
      });
    }

    // Deleting the storyboard cascades to its scenes.
    await client.storyboard.deleteMany({ where: { projectId: project.id } });
    if (project.scenes) {
      await client.storyboard.create({
        data: {
          projectId: project.id,
          ...toStoryboardColumns(project.scenes),
          scenes: {
            create: project.scenes.scenes.map(toSceneColumns),
          },
        },
      });
    }
  }
}

type PrismaTransaction = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;
