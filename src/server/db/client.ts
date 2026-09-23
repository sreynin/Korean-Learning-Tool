import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { getServerEnv } from "@/lib/env";

/**
 * Prisma 7 takes its connection through a driver adapter rather than a URL in
 * the schema. The client is cached on `globalThis` so Next.js hot reloads do
 * not open a new SQLite handle on every edit.
 */
const globalForDb = globalThis as unknown as { __prisma?: PrismaClient };

export function getDb(): PrismaClient {
  if (!globalForDb.__prisma) {
    const adapter = new PrismaBetterSqlite3({ url: resolveDatabaseUrl() });

    globalForDb.__prisma = new PrismaClient({
      adapter,
      log: getServerEnv().NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  }

  return globalForDb.__prisma;
}

/**
 * SQLite paths resolve against the project root, so the same DATABASE_URL
 * works for both the Prisma CLI and the running app. Kept in step with the
 * identical helper in prisma.config.ts, which the CLI loads standalone.
 */
export function resolveDatabaseUrl(): string {
  const configured = getServerEnv().DATABASE_URL;
  const filePath = configured.replace(/^file:/, "");

  return path.isAbsolute(filePath)
    ? `file:${filePath}`
    : `file:${path.resolve(process.cwd(), filePath)}`;
}
