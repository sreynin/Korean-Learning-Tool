import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 moved the datasource URL out of schema.prisma and into this file.
 * The Prisma CLI does not read .env.local the way Next.js does, so load it
 * here before resolving the URL.
 */
loadEnvFile(".env.local");

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: resolveDatabaseUrl() },
});

/**
 * SQLite paths are resolved against the project root rather than the schema
 * directory, so the same DATABASE_URL works for the CLI and the app.
 */
export function resolveDatabaseUrl(): string {
  const configured = process.env.DATABASE_URL ?? "file:./data/korean-learning-lab.db";
  const filePath = configured.replace(/^file:/, "");

  return path.isAbsolute(filePath)
    ? `file:${filePath}`
    : `file:${path.resolve(process.cwd(), filePath)}`;
}

/** Minimal .env reader — avoids adding dotenv for one file. */
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
