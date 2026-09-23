/**
 * Formatting helpers shared by server and client components.
 *
 * Dates are formatted with an explicit locale and time zone so a value never
 * renders differently on the server than it does after hydration.
 */

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

/** "just now", "3 hours ago", "2 days ago", then falls back to a date. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const elapsedMs = now.getTime() - new Date(iso).getTime();
  const minutes = Math.round(elapsedMs / 60_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${plural(minutes)} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${plural(hours)} ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${plural(days)} ago`;

  return formatDate(iso);
}

/** 45 → "0:45", 600 → "10:00". */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}
