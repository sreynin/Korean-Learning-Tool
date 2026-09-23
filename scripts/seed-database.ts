/**
 * Seeds the database with the sample project library.
 *
 *   npm run db:seed          # only seeds when the database is empty
 *   npm run db:seed -- --force
 *
 * This replaces the JSON store's old behaviour of seeding itself the first
 * time it was created. It is explicit now: a real database should not decide
 * to insert 24 rows because a query happened to run.
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { buildSeedProjects } from "@/server/repositories/seed-data";
import { toProjectColumns } from "@/server/repositories/project-mapper";

async function main() {
  const force = process.argv.includes("--force");

  const prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: resolveDatabaseUrl() }),
  });

  try {
    const existing = await prisma.project.count();

    if (existing > 0 && !force) {
      console.log(
        `Database already has ${existing} projects — skipping.\n` +
          `Pass --force to seed anyway.`,
      );
      return;
    }

    const projects = buildSeedProjects();

    for (const project of projects) {
      await prisma.project.upsert({
        where: { id: project.id },
        create: { id: project.id, ...toProjectColumns(project) },
        update: toProjectColumns(project),
      });
    }

    console.log(`Seeded ${projects.length} sample projects.`);
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
  console.error("Seed failed:", error);
  process.exitCode = 1;
});
