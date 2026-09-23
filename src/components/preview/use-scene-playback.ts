"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Scene } from "@/types/scene";

/** Ceiling on a single frame's advance, so a stalled loop cannot teleport. */
const MAX_FRAME_DELTA_SECONDS = 0.25;

export interface ScenePlayback {
  /** Index of the scene currently on screen. */
  index: number;
  /** Seconds elapsed within the current scene. */
  sceneElapsed: number;
  /** Seconds elapsed across the whole storyboard. */
  elapsed: number;
  totalDuration: number;
  playing: boolean;
  /** True once playback has run to the end. */
  finished: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  restart: () => void;
  next: () => void;
  previous: () => void;
  /** Jump to the first frame of a scene. */
  seekToScene: (index: number) => void;
  /** Jump to an absolute position, in seconds. */
  seekTo: (seconds: number) => void;
}

/**
 * Drives storyboard playback from a single elapsed-seconds value.
 *
 * Tracking one number rather than an index plus a per-scene timer means
 * seeking, the timeline playhead, and scene lookup all derive from the same
 * source and cannot disagree.
 */
export function useScenePlayback(scenes: Scene[]): ScenePlayback {
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);

  const offsets = useMemo(() => cumulativeOffsets(scenes), [scenes]);
  const totalDuration = offsets.total;

  // Read inside the animation frame without restarting the loop every tick.
  const totalRef = useRef(totalDuration);
  useEffect(() => {
    totalRef.current = totalDuration;
  }, [totalDuration]);

  useEffect(() => {
    if (!playing) return;

    let frame = 0;
    let previous = performance.now();

    const tick = (now: number) => {
      // Browsers throttle or stop rAF in a hidden tab. Without a ceiling, the
      // first frame after the viewer returns would carry the whole hidden
      // duration and jump the playhead to the end.
      const delta = Math.min((now - previous) / 1000, MAX_FRAME_DELTA_SECONDS);
      previous = now;

      setElapsed((current) => {
        const next = current + delta;
        if (next >= totalRef.current) {
          setPlaying(false);
          return totalRef.current;
        }
        return next;
      });

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const { index, sceneElapsed } = locate(elapsed, scenes, offsets.starts);
  const finished = totalDuration > 0 && elapsed >= totalDuration;

  const seekTo = useCallback(
    (seconds: number) => {
      setElapsed(clamp(seconds, 0, totalDuration));
    },
    [totalDuration],
  );

  const seekToScene = useCallback(
    (target: number) => {
      const safe = clamp(target, 0, Math.max(scenes.length - 1, 0));
      setElapsed(offsets.starts[safe] ?? 0);
    },
    [offsets.starts, scenes.length],
  );

  const play = useCallback(() => {
    // Replaying from the end should start over rather than sit finished.
    setElapsed((current) => (current >= totalRef.current ? 0 : current));
    setPlaying(true);
  }, []);

  const pause = useCallback(() => setPlaying(false), []);

  const toggle = useCallback(() => {
    setPlaying((current) => {
      if (!current) {
        setElapsed((value) => (value >= totalRef.current ? 0 : value));
      }
      return !current;
    });
  }, []);

  const restart = useCallback(() => {
    setElapsed(0);
    setPlaying(true);
  }, []);

  const next = useCallback(() => seekToScene(index + 1), [index, seekToScene]);

  const previous = useCallback(() => {
    // Mirrors a media player: part-way into a scene, go back to its start.
    const RESTART_THRESHOLD_SECONDS = 0.4;
    if (sceneElapsed > RESTART_THRESHOLD_SECONDS) {
      seekToScene(index);
    } else {
      seekToScene(index - 1);
    }
  }, [index, sceneElapsed, seekToScene]);

  return {
    index,
    sceneElapsed,
    elapsed,
    totalDuration,
    playing,
    finished,
    play,
    pause,
    toggle,
    restart,
    next,
    previous,
    seekToScene,
    seekTo,
  };
}

function cumulativeOffsets(scenes: Scene[]): { starts: number[]; total: number } {
  const starts: number[] = [];
  let running = 0;

  for (const scene of scenes) {
    starts.push(running);
    running += scene.duration;
  }

  return { starts, total: running };
}

function locate(
  elapsed: number,
  scenes: Scene[],
  starts: number[],
): { index: number; sceneElapsed: number } {
  if (scenes.length === 0) return { index: 0, sceneElapsed: 0 };

  for (let i = scenes.length - 1; i >= 0; i -= 1) {
    if (elapsed >= starts[i]) {
      return {
        index: i,
        sceneElapsed: Math.min(elapsed - starts[i], scenes[i].duration),
      };
    }
  }

  return { index: 0, sceneElapsed: 0 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
