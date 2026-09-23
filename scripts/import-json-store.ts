/**
 * Imports the legacy JSON store into the database.
 *
 *   npm run db:import              # default ./data/projects.json
 *   npm run db:import -- --file=path/to/projects.json
 *   npm run db:import -- --dry-run
 *
 * Repeatable: projects are matched by id and replaced, so running it twice
 * produces the same result. It never deletes rows that are absent from the
 * JSON file, so it is safe to run against a database that already has newer
 * work in it.
 *
 * The JSON file is only read, never modified or removed.
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { normalizeProject } from "@/server/repositories/normalize-project";
import {
  toLessonColumns,
  toProjectColumns,
  toSceneColumns,
  toStoryboardColumns,
} from "@/server/repositories/project-mapper";
import type { VideoProject } from "@/types/project";

interface LegacyStore {
  version?: number;
  projects?: VideoProject[];
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const fileArg = args.find((arg) => arg.startsWith("--file="));
  const filePath = path.resolve(
    process.cwd(),
    fileArg ? fileArg.slice("--file=".length) : "./data/projects.json",
  );

  if (!fs.existsSync(filePath)) {
    console.log(`No JSON store at ${filePath} — nothing to import.`);
    return;
  }

  const store = JSON.parse(fs.readFileSync(filePath, "utf8")) as LegacyStore;
  const legacyProjects = store.projects ?? [];

  if (legacyProjects.length === 0) {
    console.log("JSON store contains no projects — nothing to import.");
    return;
  }

  // Run the same normaliser the app used, so older stores (v1/v2 field names,
  // renamed pipeline stages) are upgraded before they reach the database.
  const projects = legacyProjects.map(normalizeProject);

  console.log(`Source : ${filePath} (store version ${store.version ?? "unknown"})`);
  console.log(
    `Found  : ${projects.length} projects, ` +
      `${projects.filter((p) => p.lesson).length} with a lesson, ` +
      `${projects.filter((p) => p.scenes).length} with a storyboard`,
  );

  if (dryRun) {
    console.log("\nDry run — no changes written.");
    return;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: resolveDatabaseUrl() }),
  });

  let imported = 0;
  let replaced = 0;

  try {
    for (const project of projects) {
      const existed = await prisma.project.findUnique({
        where: { id: project.id },
        select: { id: true },
      });

      await prisma.$transaction(async (tx) => {
        // Replacing the project cascades its lesson, storyboard, and scenes,
        // which keeps the import idempotent.
        await tx.project.deleteMany({ where: { id: project.id } });
        await tx.project.create({
          data: { id: project.id, ...toProjectColumns(project) },
        });

        if (project.lesson) {
          await tx.lesson.create({
            data: { projectId: project.id, ...toLessonColumns(project.lesson) },
          });
        }

        if (project.scenes) {
          await tx.storyboard.create({
            data: {
              projectId: project.id,
              ...toStoryboardColumns(project.scenes),
              scenes: { create: project.scenes.scenes.map(toSceneColumns) },
            },
          });
        }
      });

      if (existed) {
        replaced++;
      } else {
        imported++;
      }
    }

    const totals = await prisma.$transaction([
      prisma.project.count(),
      prisma.lesson.count(),
      prisma.storyboard.count(),
      prisma.scene.count(),
    ]);

    console.log(`\nImported: ${imported} new, ${replaced} replaced`);
    console.log(
      `Database: ${totals[0]} projects, ${totals[1]} lessons, ` +
        `${totals[2]} storyboards, ${totals[3]} scenes`,
    );
    console.log(`\nThe JSON file was not modified. Keep it until you are satisfied.`);
  } finally {
    await prisma.$disconnect();
  }
}

function resolveDatabaseUrl(): string {
  loadEnvFile(".env.local");
  const configured =
    process.env.DATABASE_URL ?? "file:./data/korean-learning-lab.db";
  const filePath = configured.replace(/^file:/, "");

  return path.isAbsolute(filePath)
    ? `file:${filePath}`
    : `file:${path.resolve(process.cwd(), filePath)}`;
}

function loadEnvFile(relativePath: string): void {
  const envPath = path.resolve(process.cwd(), relativePath);
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i.exec(line);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }
}

main().catch((error) => {
  console.error("\nImport failed:", error);
  process.exitCode = 1;
});
