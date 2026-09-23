import { PrismaProjectRepository } from "@/server/repositories/prisma-project-repository";
import type { ProjectRepository } from "@/server/repositories/project-repository";

/**
 * Single composition point for storage. Swapping databases means writing one
 * new implementation of `ProjectRepository` and changing the line below.
 *
 * Cached on `globalThis` so Next.js hot reloads reuse the same instance.
 */
const globalForRepositories = globalThis as unknown as {
  __projectRepository?: ProjectRepository;
};

export function getProjectRepository(): ProjectRepository {
  if (!globalForRepositories.__projectRepository) {
    globalForRepositories.__projectRepository = new PrismaProjectRepository();
  }
  return globalForRepositories.__projectRepository;
}

export type { ProjectRepository };
