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

  /**
   * How many projects match, without loading any of them.
   *
   * `list()` eagerly joins every lesson, scene, scene-audio row, render job
   * and metadata document, because the pages that render a project need them.
   * Counting through it meant pulling the entire database into memory to
   * produce one integer.
   */
  count(filters?: ProjectListFilters): Promise<number>;

  /**
   * The few columns the dashboard tiles are computed from.
   *
   * Same reason: six integers do not justify loading every lesson in the
   * library.
   */
  summaries(): Promise<ProjectSummary[]>;
}

/** Just enough of a project to count and group it. */
export interface ProjectSummary {
  id: string;
  format: VideoProject["format"];
  status: VideoProject["status"];
}
