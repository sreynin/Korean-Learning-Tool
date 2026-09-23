"use client";

import { SCENE_TYPE_META } from "@/lib/constants";
import { cn } from "@/lib/utils/cn";
import { formatDuration } from "@/lib/utils/format";
import type { ScenePlayback } from "@/components/preview/use-scene-playback";
import type { Scene } from "@/types/scene";

/**
 * Scene blocks sized in proportion to their duration, with a playhead. Click a
 * block to jump to that scene; click the ruler to scrub to a position.
 */
export function PreviewTimeline({
  scenes,
  playback,
}: {
  scenes: Scene[];
  playback: ScenePlayback;
}) {
  const { totalDuration, elapsed, index } = playback;
  const progress = totalDuration > 0 ? (elapsed / totalDuration) * 100 : 0;

  function scrub(event: React.MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - bounds.left) / bounds.width;
    playback.seekTo(ratio * totalDuration);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-foreground-muted">
        <span>Timeline</span>
        <span className="font-mono tabular-nums">
          {formatDuration(totalDuration)} total · {scenes.length} scenes
        </span>
      </div>

      <div
        onClick={scrub}
        role="presentation"
        className="relative h-14 w-full cursor-pointer overflow-hidden rounded-lg border border-border-subtle bg-surface-muted"
      >
        <div className="flex h-full w-full">
          {scenes.map((scene, sceneIndex) => {
            const share = totalDuration > 0 ? (scene.duration / totalDuration) * 100 : 0;
            const active = sceneIndex === index;

            return (
              <button
                key={scene.id}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  playback.seekToScene(sceneIndex);
                }}
                title={`${sceneIndex + 1}. ${SCENE_TYPE_META[scene.type].label} — ${scene.duration}s`}
                aria-label={`Jump to scene ${sceneIndex + 1}, ${SCENE_TYPE_META[scene.type].label}`}
                style={{ width: `${share}%` }}
                className={cn(
                  "group relative h-full min-w-1 border-r border-surface/40 px-1 text-left transition-colors last:border-r-0",
                  active
                    ? "bg-brand text-brand-foreground"
                    : "bg-surface hover:bg-brand-soft",
                )}
              >
                <span
                  className={cn(
                    "block truncate pt-1 text-[10px] font-medium",
                    active ? "text-brand-foreground" : "text-foreground-muted",
                  )}
                >
                  {sceneIndex + 1}
                </span>
                <span
                  className={cn(
                    "block truncate text-[10px]",
                    active ? "text-brand-foreground/80" : "text-foreground-muted",
                  )}
                >
                  {scene.duration}s
                </span>
              </button>
            );
          })}
        </div>

        {/* Playhead */}
        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-danger"
          style={{ left: `${progress}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
