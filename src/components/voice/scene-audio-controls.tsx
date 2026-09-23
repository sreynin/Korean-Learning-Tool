"use client";

import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import type { SceneAudio } from "@/types/voice";

/**
 * Narration controls for one scene: generate, play, regenerate, delete.
 *
 * `volume` and `speed` are applied on the audio element at playback. Pitch is
 * not applied here — whether it affects the clip depends on the provider, and
 * the settings panel says so rather than this silently ignoring it.
 */
export function SceneAudioControls({
  audio,
  disabled,
  busy,
  error,
  onGenerate,
  onDelete,
}: {
  audio: SceneAudio | null;
  disabled?: boolean;
  busy?: "generating" | "deleting" | null;
  error?: string | null;
  onGenerate: () => void;
  onDelete: () => void;
}) {
  const elementRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  function togglePlay() {
    if (!audio) return;

    const existing = elementRef.current;

    if (playing && existing) {
      existing.pause();
      setPlaying(false);
      return;
    }

    // A regenerated clip gets a new URL, so a cached element for the old one
    // must be discarded rather than replayed.
    if (existing && !existing.src.endsWith(audio.url)) {
      existing.pause();
      elementRef.current = null;
    }

    const element = elementRef.current ?? new Audio(audio.url);
    element.volume = Math.min(1, Math.max(0, audio.settings.volume));
    element.playbackRate = audio.settings.speed;
    element.onended = () => setPlaying(false);
    element.onerror = () => setPlaying(false);
    element.currentTime = 0;

    elementRef.current = element;
    void element.play().then(
      () => setPlaying(true),
      () => setPlaying(false),
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-muted/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {audio ? (
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone="success">🔊 Voice generated</Badge>
            <span className="text-xs text-foreground-muted">
              {audio.voiceName} · {audio.durationSeconds.toFixed(1)}s ·{" "}
              {audio.provider}
            </span>
          </span>
        ) : (
          <span className="text-xs text-foreground-muted">
            No narration audio yet.
          </span>
        )}

        <div className="flex shrink-0 gap-1">
          {audio ? (
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={togglePlay}
                disabled={disabled}
              >
                {playing ? "Pause" : "Play"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={busy === "generating"}
                onClick={onGenerate}
                disabled={disabled}
              >
                Regenerate
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                loading={busy === "deleting"}
                onClick={onDelete}
                disabled={disabled}
              >
                Delete
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              loading={busy === "generating"}
              onClick={onGenerate}
              disabled={disabled}
            >
              Generate voice
            </Button>
          )}
        </div>
      </div>

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      {audio ? (
        <p
          className={cn(
            "text-[11px] text-foreground-muted",
            audio.provider === "mock" && "text-warning",
          )}
        >
          {audio.provider === "mock"
            ? "Mock provider: the clip is silent, but its length matches the narration. Set ELEVENLABS_API_KEY for real speech."
            : `Rendered at ${audio.settings.speed}× speed.`}
        </p>
      ) : null}
    </div>
  );
}
