import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ProjectListFilters, VideoProject } from "@/types/project";
import type { ProjectRepository } from "@/server/repositories/project-repository";
import { normalizeProject } from "@/server/repositories/normalize-project";
import { buildSeedProjects } from "@/server/repositories/seed-data";

const STORE_VERSION = 2;
const STORE_FILE = "projects.json";

interface StoreShape {
  version: number;
  projects: VideoProject[];
}

/**
 * File-backed store for local development. Reads and writes are serialised
 * through a single promise chain, and writes go to a temp file before being
 * renamed so a crash mid-write cannot truncate the store.
 *
 * This is deliberately simple: it is a stand-in until a real database is
 * introduced, and it only supports a single running instance.
 */
export class JsonProjectRepository implements ProjectRepository {
  private readonly filePath: string;
  private readonly seedOnCreate: boolean;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: { dataDir: string; seedOnCreate: boolean }) {
    this.filePath = path.resolve(process.cwd(), options.dataDir, STORE_FILE);
    this.seedOnCreate = options.seedOnCreate;
  }

  async list(filters: ProjectListFilters = {}): Promise<VideoProject[]> {
    const { projects } = await this.read();
    const search = filters.search?.trim().toLowerCase();

    return projects
      .filter((project) => {
        if (filters.status && project.status !== filters.status) return false;
        if (filters.format && project.format !== filters.format) return false;
        if (search) {
          const haystack = `${project.title} ${project.topic}`.toLowerCase();
          if (!haystack.includes(search)) return false;
        }
        return true;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async findById(id: string): Promise<VideoProject | null> {
    const { projects } = await this.read();
    return projects.find((project) => project.id === id) ?? null;
  }

  async create(project: VideoProject): Promise<VideoProject> {
    return this.mutate((store) => {
      store.projects.push(project);
      return { changed: true, result: project };
    });
  }

  async update(
    id: string,
    changes: Partial<VideoProject>,
  ): Promise<VideoProject | null> {
    return this.mutate((store) => {
      const index = store.projects.findIndex((project) => project.id === id);
      if (index === -1) return { changed: false, result: null };

      const updated: VideoProject = { ...store.projects[index], ...changes, id };
      store.projects[index] = updated;
      return { changed: true, result: updated };
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.mutate((store) => {
      const index = store.projects.findIndex((project) => project.id === id);
      if (index === -1) return { changed: false, result: false };

      store.projects.splice(index, 1);
      return { changed: true, result: true };
    });
  }

  private async read(): Promise<StoreShape> {
    return this.enqueue(() => this.readFromDisk());
  }

  /** Read-modify-write under the same lock so concurrent updates cannot race. */
  private async mutate<T>(
    apply: (store: StoreShape) => { changed: boolean; result: T },
  ): Promise<T> {
    return this.enqueue(async () => {
      const store = await this.readFromDisk();
      const { changed, result } = apply(store);
      if (changed) {
        await this.writeToDisk(store);
      }
      return result;
    });
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    // Keep the chain alive even if a task rejects.
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async readFromDisk(): Promise<StoreShape> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as StoreShape;
      if (!Array.isArray(parsed.projects)) {
        throw new Error("Data store is malformed: `projects` is not an array.");
      }

      // Older stores are upgraded on read. The migrated shape is only written
      // back when something else triggers a write.
      return {
        version: STORE_VERSION,
        projects: parsed.projects.map(normalizeProject),
      };
    } catch (error) {
      if (isMissingFile(error)) {
        const initial: StoreShape = {
          version: STORE_VERSION,
          projects: this.seedOnCreate ? buildSeedProjects() : [],
        };
        await this.writeToDisk(initial);
        return initial;
      }
      throw error;
    }
  }

  private async writeToDisk(store: StoreShape): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(tempPath, JSON.stringify(store, null, 2), "utf8");
    await rename(tempPath, this.filePath);
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
