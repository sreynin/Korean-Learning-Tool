"use client";

import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/utils/format";
import type { ScenePlayback } from "@/components/preview/use-scene-playback";

export function PlaybackControls({
  playback,
  sceneCount,
}: {
  playback: ScenePlayback;
  sceneCount: number;
}) {
  const { index, playing, elapsed, totalDuration } = playback;

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={playback.restart}
        aria-label="Restart from the beginning"
      >
        Restart
      </Button>

      <Button
        variant="secondary"
        size="sm"
        onClick={playback.previous}
        disabled={index === 0 && playback.sceneElapsed === 0}
        aria-label="Previous scene"
      >
        Previous
      </Button>

      <Button
        onClick={playback.toggle}
        aria-label={playing ? "Pause" : "Play"}
        className="min-w-24"
      >
        {playing ? "Pause" : "Play"}
      </Button>

      <Button
        variant="secondary"
        size="sm"
        onClick={playback.next}
        disabled={index >= sceneCount - 1}
        aria-label="Next scene"
      >
        Next
      </Button>

      <span
        className="ml-2 font-mono text-sm text-foreground-muted tabular-nums"
        aria-live="off"
      >
        {formatDuration(Math.floor(elapsed))} / {formatDuration(totalDuration)}
      </span>
    </div>
  );
}
