"use client";

import {
  ANIMATION_CLASS,
  PREVIEW_FORMATS,
  TRANSITION_CLASS,
  backgroundGradient,
  typewriterSlice,
} from "@/lib/preview";
import type { PreviewFormat } from "@/lib/preview";
import { cn } from "@/lib/utils/cn";
import type { Scene } from "@/types/scene";

/**
 * One video frame. The stage renders at the format's logical size and scales
 * to fit its container, so on-screen text keeps the same proportion it will
 * have in the exported video. Text sizes are in container-query units for the
 * same reason.
 */
export function SceneStage({
  scene,
  sceneElapsed,
  format,
}: {
  scene: Scene | null;
  sceneElapsed: number;
  format: PreviewFormat;
}) {
  const { width, height } = PREVIEW_FORMATS[format];

  return (
    <div
      className="kl-stage relative mx-auto w-full overflow-hidden rounded-xl bg-black shadow-lg"
      style={{
        aspectRatio: `${width} / ${height}`,
        maxHeight: "100%",
        maxWidth: format === "shorts" ? "min(100%, 46vh)" : "100%",
        containerType: "size",
      }}
    >
      {scene ? (
        <div
          // Remounting on scene change replays both the entry transition and
          // the content animation, exactly as a cut would in the final video.
          key={scene.id}
          className={cn(
            "absolute inset-0 flex flex-col items-center justify-center gap-[2cqh] px-[8cqw] text-center",
            TRANSITION_CLASS[scene.transition],
          )}
          style={{ background: backgroundGradient(scene.background || scene.id) }}
        >
          <div
            className={cn(
              "flex flex-col items-center gap-[2cqh]",
              ANIMATION_CLASS[scene.animation],
            )}
          >
            {scene.koreanText ? (
              <p
                lang="ko"
                className="font-bold text-white drop-shadow-lg"
                style={{ fontSize: "9cqw", lineHeight: 1.15 }}
              >
                {scene.animation === "typewriter"
                  ? typewriterSlice(scene.koreanText, sceneElapsed, scene.duration)
                  : scene.koreanText}
              </p>
            ) : null}

            {scene.romanization ? (
              <p
                className="text-white/75 italic"
                style={{ fontSize: "4cqw", lineHeight: 1.2 }}
              >
                {scene.romanization}
              </p>
            ) : null}

            {scene.englishText ? (
              <p
                className="font-medium text-white/95"
                style={{ fontSize: "5cqw", lineHeight: 1.25 }}
              >
                {scene.englishText}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 grid place-items-center text-sm text-white/60">
          No scene
        </div>
      )}
    </div>
  );
}
