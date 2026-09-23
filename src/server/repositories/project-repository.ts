import type { ProjectListFilters, VideoProject } from "@/types/project";

/**
 * Storage boundary for projects. Implementations are dumb persistence — all
 * business rules live in the service layer. Swapping the JSON file store for a
 * database means writing one new implementation of this interface.
 */
export interface ProjectRepository {
  /** Returns matching projects, most recently updated first. */
  list(filters?: ProjectListFilters): Promise<VideoProject[]>;
  findById(id: string): Promise<VideoProject | null>;
  create(project: VideoProject): Promise<VideoProject>;
  /** Returns the updated project, or null if the id does not exist. */
  update(id: string, changes: Partial<VideoProject>): Promise<VideoProject | null>;
  /** Returns false if the id did not exist. */
  delete(id: string): Promise<boolean>;
}
