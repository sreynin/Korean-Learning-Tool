import { getServerEnv } from "@/lib/env";
import { JsonProjectRepository } from "@/server/repositories/json-project-repository";
import type { ProjectRepository } from "@/server/repositories/project-repository";

/**
 * Single composition point for storage. Swap the implementation here when a
 * real database replaces the JSON file store — nothing above this line changes.
 *
 * The instance is cached on `globalThis` so Next.js hot reloads in development
 * do not create a second repository with its own write queue.
 */
const globalForRepositories = globalThis as unknown as {
  __projectRepository?: ProjectRepository;
};

export function getProjectRepository(): ProjectRepository {
  if (!globalForRepositories.__projectRepository) {
    const env = getServerEnv();
    globalForRepositories.__projectRepository = new JsonProjectRepository({
      dataDir: env.DATA_DIR,
      seedOnCreate: env.SEED_SAMPLE_DATA,
    });
  }
  return globalForRepositories.__projectRepository;
}

export type { ProjectRepository };
