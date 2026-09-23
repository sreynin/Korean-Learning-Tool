import type { SceneAnimation, SceneTransition } from "@/types/scene";
import type { VideoFormat } from "@/types/project";

/**
 * Preview frame sizes. The stage renders at these logical dimensions and is
 * scaled to fit, so text size relative to the frame matches the final video.
 */
export const PREVIEW_FORMATS = {
  shorts: { label: "YouTube Short", width: 1080, height: 1920 },
  long: { label: "YouTube Video", width: 1920, height: 1080 },
} as const;

export type PreviewFormat = keyof typeof PREVIEW_FORMATS;

/**
 * Which frame sizes a project can be previewed in. A "both" project is cut
 * into each, so it offers a toggle.
 */
export function previewFormatsFor(format: VideoFormat): PreviewFormat[] {
  if (format === "both") return ["shorts", "long"];
  return [format];
}

/** CSS class applied to a scene's content, keyed by its animation. */
export const ANIMATION_CLASS: Record<SceneAnimation, string> = {
  none: "",
  fade_in: "kl-anim-fade-in",
  slide_up: "kl-anim-slide-up",
  slide_left: "kl-anim-slide-left",
  pop: "kl-anim-pop",
  zoom_in: "kl-anim-zoom-in",
  // Driven by character count in JS rather than CSS, so it stays in step
  // with the playhead when the viewer scrubs.
  typewriter: "",
};

/** CSS class applied to the whole frame as a scene enters. */
export const TRANSITION_CLASS: Record<SceneTransition, string> = {
  cut: "",
  fade: "kl-trans-fade",
  slide: "kl-trans-slide",
  zoom: "kl-trans-zoom",
  dissolve: "kl-trans-dissolve",
};

/** How long a scene's entry transition runs, in seconds. */
export const TRANSITION_DURATION_SECONDS = 0.4;

/**
 * Deterministic backdrop for a scene. Real imagery arrives with the assets
 * stage; until then the same scene always gets the same gradient so the
 * preview does not shimmer between renders.
 */
export function backgroundGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  }

  const from = hash;
  const to = (hash + 48) % 360;
  return `linear-gradient(140deg, oklch(0.42 0.11 ${from}), oklch(0.26 0.08 ${to}))`;
}

/** Characters of `text` visible at `elapsed` seconds into a typewriter scene. */
export function typewriterSlice(
  text: string,
  elapsed: number,
  duration: number,
): string {
  if (!text) return "";
  // Finish typing in the first 60% of the scene so the result stays readable.
  const typingWindow = Math.max(duration * 0.6, 0.1);
  const ratio = Math.min(1, elapsed / typingWindow);
  return text.slice(0, Math.ceil(text.length * ratio));
}
