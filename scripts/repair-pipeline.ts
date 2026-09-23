/**
 * Recomputes every project's pipeline from what it actually contains.
 *
 *   npm run db:repair-pipeline -- --dry-run
 *   npm run db:repair-pipeline
 *
 * Existing rows were written when stage status was set by hand, so some claim
 * stages that were never run — seeded demo projects in particular reported
 * `assets`, `render`, and `youtube` complete against code that does not exist.
 *
 * Only the pipeline is touched. Lessons, storyboards, audio, and settings are
 * read but never modified, and the result is derived from those, so running
 * this twice changes nothing the second time.
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { toDomain } from "@/server/repositories/project-mapper";
import {
  pipelineDiffers,
  reconcilePipeline,
} from "@/server/services/pipeline-service";
import { PIPELINE_STAGES } from "@/types/project";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: resolveDatabaseUrl() }),
  });

  try {
    const rows = await prisma.project.findMany({
      include: {
        lesson: true,
        storyboard: { include: { scenes: { include: { audio: true } } } },
        renderJobs: { orderBy: { createdAt: "desc" } },
        metadata: true,
      },
    });

    let changed = 0;

    for (const row of rows) {
      const project = toDomain(row);
      const next = reconcilePipeline(project);

      if (!pipelineDiffers(project.pipeline, next)) continue;

      const before = summarise(project.pipeline);
      const after = summarise(next);
      console.log(`${project.id}  ${project.title}`);
      console.log(`  before: ${before || "(none)"}`);
      console.log(`  after : ${after || "(none)"}`);

      if (!dryRun) {
        await prisma.project.update({
          where: { id: project.id },
          data: { pipeline: JSON.stringify(next) },
        });
      }
      changed += 1;
    }

    console.log(
      `\n${rows.length} projects inspected, ${changed} ${
        dryRun ? "would change" : "updated"
      }.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

function summarise(pipeline: Record<string, { status: string }>): string {
  return PIPELINE_STAGES.filter(
    (stage) => pipeline[stage]?.status === "complete",
  ).join(", ");
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
  console.error("\nRepair failed:", error);
  process.exitCode = 1;
});
