import { AppError } from "@/server/errors";

/**
 * A small in-process rate limiter for the routes that cost money.
 *
 * Lesson, scene, metadata and voice generation each call a paid API, and every
 * one of them runs inside the request with `maxDuration = 300`. Nothing
 * bounded how often they could be called, so a stuck retry loop in a component
 * — or a tab left reloading — could run up a bill unattended. This is the
 * cheapest thing that makes that impossible.
 *
 * It is deliberately **not** a security control. The app has no
 * authentication, so there is no identity to limit; this limits the
 * *installation*, which is the right scope for protecting a spending account
 * on a single-user tool. Against a determined caller on the same machine it
 * does nothing, and it is not meant to.
 *
 * In-process and in-memory, with the same limits as the queues: it bounds this
 * process and resets when it restarts. A multi-instance deployment would need
 * the counter to live somewhere shared.
 */

interface Bucket {
  /** Timestamps of the calls still inside the window. */
  hits: number[];
}

const buckets = new Map<string, Bucket>();

export interface RateLimitRule {
  /** How many calls are allowed inside the window. */
  limit: number;
  windowMs: number;
}

/**
 * The limits are calibrated against the failure they exist to stop.
 *
 * A runaway retry loop makes hundreds of calls a minute. A creator working by
 * hand makes a few dozen an hour at the very most. Anything between those two
 * numbers catches the bug without ever getting in the creator's way, so these
 * sit deliberately near the top of human usage rather than near the bottom —
 * a limiter that blocks real work is a worse bug than the one it prevents.
 */

/** A whole document: a lesson, a storyboard, or one cut's metadata. */
export const GENERATION_LIMIT: RateLimitRule = {
  limit: 40,
  windowMs: 60 * 60 * 1000,
};

/**
 * One metadata field.
 *
 * Far higher, because regenerating a single field is the cheap operation the
 * metadata panel is built around: a `both` project has two documents of six
 * fields each, and polishing them is meant to be iterative.
 */
export const FIELD_LIMIT: RateLimitRule = {
  limit: 200,
  windowMs: 60 * 60 * 1000,
};

/**
 * Narration, which is per scene. A storyboard may hold up to 120 scenes, so
 * voicing one project end to end has to fit inside this comfortably.
 */
export const VOICE_LIMIT: RateLimitRule = {
  limit: 300,
  windowMs: 60 * 60 * 1000,
};

export class RateLimitError extends AppError {
  constructor(retryAfterSeconds: number) {
    super(
      "conflict",
      `This installation has made too many generation requests. Try again in ${formatWait(retryAfterSeconds)}.`,
      429,
    );
  }
}

/**
 * Records one call against `key` and throws when the rule is exceeded.
 *
 * Called at the top of a route, before any paid work starts — a limiter that
 * runs after the API call has already protected nothing.
 */
export function enforceRateLimit(key: string, rule: RateLimitRule): void {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [] };

  // Drop everything that has aged out, so the array cannot grow without bound.
  bucket.hits = bucket.hits.filter((at) => now - at < rule.windowMs);

  if (bucket.hits.length >= rule.limit) {
    const oldest = bucket.hits[0] ?? now;
    const retryAfter = Math.ceil((rule.windowMs - (now - oldest)) / 1000);
    buckets.set(key, bucket);
    throw new RateLimitError(Math.max(1, retryAfter));
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);
}

/** Test hook. There is no production reason to clear the counters. */
export function resetRateLimits(): void {
  buckets.clear();
}

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "a minute" : `${minutes} minutes`;
}
