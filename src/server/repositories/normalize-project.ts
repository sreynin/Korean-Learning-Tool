import {
  LONG_DURATION_OPTIONS,
  SHORTS_DURATION_OPTIONS,
  producesLongForm,
  producesShorts,
} from "@/types/project";
import type { VideoProject } from "@/types/project";

/**
 * Brings a stored record up to the current shape.
 *
 * Version 1 had a single free-form `targetDurationSeconds` and no target
 * language, content style, or visual style. Rather than failing on an older
 * store, fill the gaps with the same defaults the create form uses.
 */
export function normalizeProject(raw: VideoProject): VideoProject {
  const legacy = raw as VideoProject & { targetDurationSeconds?: number };
  const { targetDurationSeconds, ...project } = legacy;

  return {
    ...project,
    targetLanguage: project.targetLanguage ?? "korean",
    contentStyle: project.contentStyle ?? "vocabulary",
    visualStyle: project.visualStyle ?? "clean_educational",
    lesson: project.lesson ?? null,
    shortsDurationSeconds: producesShorts(project.format)
      ? (project.shortsDurationSeconds ??
        nearest(targetDurationSeconds, SHORTS_DURATION_OPTIONS))
      : null,
    longDurationSeconds: producesLongForm(project.format)
      ? (project.longDurationSeconds ??
        nearest(targetDurationSeconds, LONG_DURATION_OPTIONS))
      : null,
  };
}

/** Snaps a legacy free-form duration onto the closest allowed option. */
function nearest<T extends number>(
  seconds: number | undefined,
  options: readonly [T, ...T[]],
): T {
  if (seconds === undefined) return options[0];

  return options.reduce((closest, option) =>
    Math.abs(option - seconds) < Math.abs(closest - seconds) ? option : closest,
  );
}
