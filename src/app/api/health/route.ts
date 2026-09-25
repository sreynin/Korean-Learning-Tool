import { getFeatureAvailability } from "@/lib/env";
import { jsonError, jsonOk, route } from "@/server/http";
import { AppError } from "@/server/errors";
import { getDb } from "@/server/db/client";
import { ffmpegPath } from "@/server/render/ffmpeg";
import { access } from "node:fs/promises";

/**
 * Whether this installation actually works.
 *
 * It used to report configuration booleans and nothing else, which meant it
 * answered `ok` with an unreachable database and a missing encoder — the two
 * failures most worth knowing about. A health check that cannot fail is not a
 * health check.
 *
 * Each dependency is reported separately so the answer says *what* is broken,
 * and the status code carries it for anything that only reads codes.
 */
export const dynamic = "force-dynamic";

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

export const GET = route(async (_request: Request) => {
  const checks = await Promise.all([checkDatabase(), checkEncoder()]);
  const healthy = checks.every((check) => check.ok);

  const body = {
    status: healthy ? ("ok" as const) : ("degraded" as const),
    timestamp: new Date().toISOString(),
    checks,
    features: getFeatureAvailability(),
  };

  if (healthy) return jsonOk(body);

  // 503 so a probe that reads only the status line still sees the failure.
  return jsonError(
    new AppError(
      "internal_error",
      `Unhealthy: ${checks
        .filter((check) => !check.ok)
        .map((check) => check.name)
        .join(", ")}.`,
      503,
    ),
  );
});

async function checkDatabase(): Promise<Check> {
  try {
    // Cheapest statement that proves the file is open and the schema is there.
    await getDb().project.count();
    return { name: "database", ok: true };
  } catch (error) {
    return {
      name: "database",
      ok: false,
      detail: error instanceof Error ? error.message : "unreachable",
    };
  }
}

async function checkEncoder(): Promise<Check> {
  try {
    await access(ffmpegPath());
    return { name: "ffmpeg", ok: true };
  } catch {
    // Rendering is the one feature that fails at the very end of a long job if
    // this is wrong, so it is worth knowing before a render is started.
    return { name: "ffmpeg", ok: false, detail: "no usable FFmpeg binary" };
  }
}
