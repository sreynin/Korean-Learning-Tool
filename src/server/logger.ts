/**
 * Logging, with levels and one shape.
 *
 * Before this there were bare `console.*` calls in a dozen files, at whatever
 * level each site happened to pick, with no way to turn them down and nothing
 * machine-readable to scrape. This does not add a dependency or a transport —
 * it is still stdout — but it gives every line a level, a scope and a
 * timestamp, so a real collector can be pointed at it later without touching
 * the call sites.
 *
 * `LOG_LEVEL` sets the floor (`debug` | `info` | `warn` | `error`), defaulting
 * to `info` in production and `debug` otherwise.
 */

const LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LEVELS)[number];

function configuredLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.toLowerCase();

  if (raw && (LEVELS as readonly string[]).includes(raw)) {
    return raw as LogLevel;
  }

  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

/**
 * Strips absolute filesystem paths out of anything destined for a log line or
 * an API response.
 *
 * FFmpeg writes its working paths into stderr, and that stderr tail ends up in
 * a job's `errorMessage` — which is stored and handed to the browser. That
 * leaked the installation's directory layout, and the creator's home directory
 * name with it, to anything reading the API.
 *
 * Paths become `<path>/name.ext`, keeping the file name, which is the part
 * that actually explains the failure.
 */
export function redactPaths(text: string): string {
  // URLs are set aside first. A publish failure legitimately names a YouTube
  // endpoint, and `https://host/path` looks exactly like a filesystem path to
  // a regex — redacting it turned a useful message into `http<path>/v3`.
  const urls: string[] = [];
  const withoutUrls = text.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, (url) => {
    urls.push(url);
    return `\u0000URL${urls.length - 1}\u0000`;
  });

  const redacted = withoutUrls
    // An absolute POSIX path: a leading slash at a word boundary, then at
    // least two segments. Two is what keeps "and/or" out of it.
    .replace(
      /(^|[\s('"[])(\/(?:[^\s"'<>|:]+\/)+[^\s"'<>|:]*)/g,
      (_match, lead: string, target: string) => `${lead}${shorten(target, "/")}`,
    )
    // A Windows drive path.
    .replace(/\b[A-Za-z]:\\[^\s"'<>|]+/g, (match) => shorten(match, "\\"));

  return redacted.replace(/\u0000URL(\d+)\u0000/g, (_match, index: string) =>
    urls[Number(index)] ?? "",
  );
}

/** Keeps the last segment — the part that explains the failure. */
function shorten(target: string, separator: string): string {
  const name = target.split(separator).filter(Boolean).pop();
  return name ? `<path>${separator}${name}` : "<path>";
}

export interface Logger {
  debug(message: string, detail?: unknown): void;
  info(message: string, detail?: unknown): void;
  warn(message: string, detail?: unknown): void;
  error(message: string, detail?: unknown): void;
}

/**
 * A logger tagged with the subsystem it belongs to, e.g. `render`, `publish`.
 * The scope replaces the ad-hoc `[render]` prefixes that were being typed by
 * hand and were inconsistent.
 */
export function createLogger(scope: string): Logger {
  const floor = LEVELS.indexOf(configuredLevel());

  const emit = (level: LogLevel, message: string, detail?: unknown) => {
    if (LEVELS.indexOf(level) < floor) return;

    const line = {
      level,
      scope,
      time: new Date().toISOString(),
      message: redactPaths(message),
      ...describe(detail),
    };

    // One JSON object per line: readable enough in a terminal, parseable by a
    // collector without a format to agree on first.
    const serialised = JSON.stringify(line);

    if (level === "error") console.error(serialised);
    else if (level === "warn") console.warn(serialised);
    else console.log(serialised);
  };

  return {
    debug: (message, fields) => emit("debug", message, fields),
    info: (message, fields) => emit("info", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    error: (message, fields) => emit("error", message, fields),
  };
}

/**
 * Turns whatever a call site passed into fields on the line.
 *
 * Call sites pass three things in practice: nothing, an `Error`, or a small
 * bag of context. An `Error` is unpacked rather than stringified as
 * `[object Object]`, and its stack is kept — it is the reason the line exists.
 * Stacks contain file paths, so they are redacted like everything else.
 */
function describe(detail: unknown): Record<string, unknown> {
  if (detail === undefined || detail === null) return {};

  if (detail instanceof Error) {
    return {
      error: redactPaths(detail.message),
      ...(detail.stack ? { stack: redactPaths(detail.stack) } : {}),
    };
  }

  if (typeof detail === "object") {
    return Object.fromEntries(
      Object.entries(detail as Record<string, unknown>).map(([key, value]) => [
        key,
        typeof value === "string" ? redactPaths(value) : value,
      ]),
    );
  }

  return { detail: typeof detail === "string" ? redactPaths(detail) : detail };
}
