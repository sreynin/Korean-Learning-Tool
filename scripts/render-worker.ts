/**
 * Drains pending render jobs from a separate process.
 *
 *   npm run render:worker            # drain once and exit
 *   npm run render:worker -- --watch # keep polling
 *
 * The app's in-process queue handles jobs during normal use. This exists to
 * prove the job row is the only coupling between the API and the renderer: a
 * different process, with no HTTP request in sight, can pick up the same work.
 * It is also the migration path — swap this polling loop for a real queue
 * consumer and nothing else changes.
 *
 * Claiming is atomic, so running this alongside the app is safe: whichever
 * claims a job first owns it.
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { PrismaProjectRepository } from "@/server/repositories/prisma-project-repository";
import { RenderJobRepository } from "@/server/repositories/render-job-repository";
import { getRenderer } from "@/server/render";
import { runRenderJob } from "@/server/render/render-queue";

const POLL_INTERVAL_MS = 2000;

async function main() {
  const watch = process.argv.includes("--watch");

  const prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: resolveDatabaseUrl() }),
  });
  const jobs = new RenderJobRepository(prisma);
  const projects = new PrismaProjectRepository(prisma);
  const renderer = getRenderer();

  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  console.log(`render worker started (${watch ? "watching" : "single pass"})`);

  try {
    do {
      const claimable = await jobs.listClaimable();

      for (const job of claimable) {
        if (controller.signal.aborted) break;

        console.log(`→ ${job.id} (${job.status})`);
        await runRenderJob({
          jobId: job.id,
          renderer,
          jobs,
          projects,
          signal: controller.signal,
        });

        const settled = await jobs.findById(job.id);
        console.log(
          `← ${job.id} ${settled?.status}${
            settled?.errorMessage ? `: ${settled.errorMessage}` : ""
          }`,
        );
      }

      if (watch && !controller.signal.aborted) {
        await delay(POLL_INTERVAL_MS);
      }
    } while (watch && !controller.signal.aborted);
  } finally {
    await prisma.$disconnect();
  }

  console.log("render worker stopped");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  console.error("render worker failed:", error);
  process.exitCode = 1;
});
