import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

const WORKSPACE = path.join(tmpdir(), "korean-learning-lab-tests");

export interface TestDatabase {
  client: PrismaClient;
  dispose: () => Promise<void>;
}

/**
 * A real SQLite file with the real migrations applied — the same storage the
 * app uses, so these tests exercise the actual schema rather than a stand-in.
 *
 * Each call migrates its own database. Copying a pre-built template would be
 * faster, but SQLite keeps recent writes in a `-wal` sidecar, so a plain file
 * copy can arrive empty. At this suite size the extra second is not worth the
 * subtlety.
 */
export function createTestDatabase(): TestDatabase {
  mkdirSync(WORKSPACE, { recursive: true });
  const file = path.join(WORKSPACE, `${randomUUID()}.db`);

  try {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: `file:${file}` },
      stdio: "pipe",
    });
  } catch (error) {
    const detail =
      error && typeof error === "object" && "stderr" in error
        ? String((error as { stderr?: Buffer }).stderr)
        : String(error);
    throw new Error(`Could not prepare the test database schema:\n${detail}`);
  }

  const client = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: `file:${file}` }),
  });

  return {
    client,
    dispose: async () => {
      await client.$disconnect();
      for (const suffix of ["", "-wal", "-shm"]) {
        rmSync(`${file}${suffix}`, { force: true });
      }
    },
  };
}
