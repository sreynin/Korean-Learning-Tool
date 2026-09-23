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
import {
  DEFAULT_CAPTION_SETTINGS,
  ENGLISH_SCALE,
  KOREAN_FONT_SIZE_CQW,
  ROMANIZATION_SCALE,
  segmentCaption,
} from "@/types/caption";
import type { CaptionSettings } from "@/types/caption";
import type { Scene } from "@/types/scene";

const POSITION_CLASS: Record<CaptionSettings["position"], string> = {
  top: "justify-start pt-[10cqh]",
  center: "justify-center",
  bottom: "justify-end pb-[10cqh]",
};

const ALIGNMENT_CLASS: Record<CaptionSettings["alignment"], string> = {
  left: "items-start text-left",
  center: "items-center text-center",
  right: "items-end text-right",
};

const CAPTION_ANIMATION_CLASS: Record<CaptionSettings["animation"], string> = {
  none: "",
  fade: "kl-anim-fade-in",
  slide_up: "kl-anim-slide-up",
  pop: "kl-anim-pop",
};

/**
 * One video frame. The stage renders at the format's logical size and scales
 * to fit its container, so on-screen text keeps the same proportion it will
 * have in the exported video. Text sizes are in container-query units for the
 * same reason.
 *
 * Caption settings govern how the scene's text is drawn; the scene's own
 * `animation` still drives the non-caption motion.
 */
export function SceneStage({
  scene,
  sceneElapsed,
  format,
  captions = DEFAULT_CAPTION_SETTINGS,
}: {
  scene: Scene | null;
  sceneElapsed: number;
  format: PreviewFormat;
  captions?: CaptionSettings;
}) {
  const { width, height } = PREVIEW_FORMATS[format];
  const koreanSize = KOREAN_FONT_SIZE_CQW[captions.fontSize];

  // A caption animation overrides the scene animation for the text block, so
  // the two cannot fight over the same element.
  const textAnimation =
    captions.animation === "none"
      ? ANIMATION_CLASS[scene?.animation ?? "none"]
      : CAPTION_ANIMATION_CLASS[captions.animation];

  const koreanText =
    scene && scene.animation === "typewriter"
      ? typewriterSlice(scene.koreanText, sceneElapsed, scene.duration)
      : (scene?.koreanText ?? "");

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
            "absolute inset-0 flex flex-col px-[8cqw]",
            POSITION_CLASS[captions.position],
            TRANSITION_CLASS[scene.transition],
          )}
          style={{ background: backgroundGradient(scene.background || scene.id) }}
        >
          <div
            className={cn(
              "flex flex-col gap-[2cqh]",
              ALIGNMENT_CLASS[captions.alignment],
              textAnimation,
            )}
          >
            {captions.showKorean && koreanText ? (
              <p
                lang="ko"
                className="font-bold text-white drop-shadow-lg"
                style={{ fontSize: `${koreanSize}cqw`, lineHeight: 1.15 }}
              >
                {segmentCaption(koreanText, scene.highlightTerms).map(
                  (segment, index) => (
                    <span
                      key={index}
                      className={
                        segment.highlighted
                          ? "rounded-[0.15em] bg-[color-mix(in_oklab,var(--brand)_85%,white)] px-[0.12em] text-white"
                          : undefined
                      }
                    >
                      {segment.text}
                    </span>
                  ),
                )}
              </p>
            ) : null}

            {captions.showRomanization && scene.romanization ? (
              <p
                className="text-white/75 italic"
                style={{
                  fontSize: `${koreanSize * ROMANIZATION_SCALE}cqw`,
                  lineHeight: 1.2,
                }}
              >
                {scene.romanization}
              </p>
            ) : null}

            {captions.showEnglish && scene.englishText ? (
              <p
                className="font-medium text-white/95"
                style={{
                  fontSize: `${koreanSize * ENGLISH_SCALE}cqw`,
                  lineHeight: 1.25,
                }}
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
