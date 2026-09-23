"use client";

import { useEffect, useState } from "react";
import { PlaybackControls } from "@/components/preview/playback-controls";
import { PreviewTimeline } from "@/components/preview/preview-timeline";
import { SceneProperties } from "@/components/preview/scene-properties";
import { SceneStage } from "@/components/preview/scene-stage";
import { useScenePlayback } from "@/components/preview/use-scene-playback";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SCENE_TYPE_META } from "@/lib/constants";
import { PREVIEW_FORMATS, previewFormatsFor } from "@/lib/preview";
import type { PreviewFormat } from "@/lib/preview";
import { cn } from "@/lib/utils/cn";
import type { VideoProject } from "@/types/project";
import type { Scene } from "@/types/scene";

export function PreviewWorkspace({ project }: { project: VideoProject }) {
  const scenes = project.scenes?.scenes ?? [];
  const availableFormats = previewFormatsFor(project.format);

  const [format, setFormat] = useState<PreviewFormat>(availableFormats[0]);
  const playback = useScenePlayback(scenes);
  const current: Scene | null = scenes[playback.index] ?? null;

  // Space toggles playback, arrows step scenes — the shortcuts a scrubbing
  // editor expects. Ignored while typing in a field.
  const { toggle, next, previous } = playback;
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // The target is not always an element (it can be the document or window),
      // so narrow before calling closest rather than casting.
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, select, [contenteditable]")
      ) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        toggle();
      } else if (event.code === "ArrowRight") {
        event.preventDefault();
        next();
      } else if (event.code === "ArrowLeft") {
        event.preventDefault();
        previous();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle, next, previous]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)_17rem]">
        {/* LEFT — scene list */}
        <Card className="order-2 lg:order-1">
          <CardContent className="p-3">
            <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-foreground-muted uppercase">
              Scenes
            </p>
            <ol className="flex max-h-[28rem] flex-col gap-1 overflow-y-auto">
              {scenes.map((scene, index) => {
                const active = index === playback.index;
                return (
                  <li key={scene.id}>
                    <button
                      type="button"
                      onClick={() => playback.seekToScene(index)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "w-full rounded-md px-2 py-1.5 text-left transition-colors",
                        active
                          ? "bg-brand-soft text-brand"
                          : "hover:bg-surface-muted",
                      )}
                    >
                      <span className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold">{index + 1}</span>
                        <span className="text-foreground-muted">
                          {scene.duration}s
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-foreground">
                        {scene.koreanText ||
                          scene.englishText ||
                          SCENE_TYPE_META[scene.type].label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>

        {/* CENTER — preview */}
        <Card className="order-1 lg:order-2">
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {current ? (
                  <Badge tone={SCENE_TYPE_META[current.type].tone}>
                    {SCENE_TYPE_META[current.type].label}
                  </Badge>
                ) : null}
                <span className="text-xs text-foreground-muted">
                  {PREVIEW_FORMATS[format].width} ×{" "}
                  {PREVIEW_FORMATS[format].height}
                </span>
              </div>

              {availableFormats.length > 1 ? (
                <div className="flex gap-1">
                  {availableFormats.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setFormat(option)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        option === format
                          ? "border-brand bg-brand text-brand-foreground"
                          : "border-border-subtle text-foreground-muted hover:text-foreground",
                      )}
                    >
                      {PREVIEW_FORMATS[option].label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex min-h-[24rem] items-center justify-center">
              <SceneStage
                scene={current}
                sceneElapsed={playback.sceneElapsed}
                format={format}
              />
            </div>

            {/* Narration sits outside the frame on purpose: it is spoken, not
                shown on screen. Some scenes (a hook, typically) carry no
                on-screen text at all, which would otherwise look like a bug. */}
            <div className="min-h-12 rounded-lg bg-surface-muted px-3 py-2">
              <p className="text-[10px] font-semibold tracking-wide text-foreground-muted uppercase">
                Narration
              </p>
              <p className="text-sm text-foreground">
                {current?.narration || "—"}
              </p>
            </div>

            <PlaybackControls playback={playback} sceneCount={scenes.length} />

            <p className="text-center text-xs text-foreground-muted">
              Space to play or pause · arrow keys to step scenes. Backgrounds are
              placeholders until the assets stage is built.
            </p>
          </CardContent>
        </Card>

        {/* RIGHT — properties */}
        <Card className="order-3">
          <CardContent>
            <p className="mb-3 text-xs font-semibold tracking-wide text-foreground-muted uppercase">
              Properties
            </p>
            <SceneProperties
              scene={current}
              index={playback.index}
              projectId={project.id}
            />
          </CardContent>
        </Card>
      </div>

      {/* BOTTOM — timeline */}
      <Card className="order-4">
        <CardContent>
          <PreviewTimeline scenes={scenes} playback={playback} />
        </CardContent>
      </Card>
    </div>
  );
}
