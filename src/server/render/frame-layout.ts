import { PREVIEW_FORMATS } from "@/lib/preview";
import {
  ENGLISH_SCALE,
  KOREAN_FONT_SIZE_CQW,
  ROMANIZATION_SCALE,
} from "@/types/caption";
import type { CaptionSettings } from "@/types/caption";
import type { RenderFormat } from "@/types/render";
import type { Scene } from "@/types/scene";

/**
 * Where the text goes on a frame.
 *
 * This is the preview's layout expressed in pixels instead of container-query
 * units: same font scale, same 8% side padding, same 10% top/bottom inset, same
 * order of layers. Keeping it pure means the arithmetic is testable without
 * running FFmpeg, and it is the only place that has to change when real
 * background assets arrive.
 */

/** Share of frame width reserved on each side, matching `px-[8cqw]`. */
const SIDE_PADDING_RATIO = 0.08;
/** Share of frame height before a top-anchored or after a bottom-anchored block. */
const EDGE_INSET_RATIO = 0.1;
/** Gap between layers, matching `gap-[2cqh]`. */
const LAYER_GAP_RATIO = 0.02;

const LINE_HEIGHT = { korean: 1.15, romanization: 1.2, english: 1.25 } as const;

/**
 * Rough advance width per character as a share of font size. Hangul and other
 * full-width scripts occupy about one em; Latin averages near half. Used only
 * to decide where to wrap, so being a little conservative is the safe error.
 */
const CHAR_WIDTH_EM = { wide: 1, narrow: 0.52, space: 0.26 } as const;

export type TextLayer = "korean" | "romanization" | "english";

export interface LaidOutText {
  layer: TextLayer;
  /**
   * Wrapped lines. Each is drawn separately so every line is aligned on its
   * own — FFmpeg aligns a multi-line block by its widest line, which would
   * leave a centred caption looking ragged.
   */
  lines: string[];
  fontSize: number;
  lineHeight: number;
  /** Top edge of this layer, in pixels from the top of the frame. */
  y: number;
  height: number;
  /** 1 for the Korean layer; the other two are dimmed as in the preview. */
  opacity: number;
}

export interface FrameSize {
  width: number;
  height: number;
}

export function frameSize(format: RenderFormat): FrameSize {
  const { width, height } = PREVIEW_FORMATS[format];
  return { width, height };
}

/**
 * Splits `text` so no line is wider than `maxWidth` at `fontSize`.
 *
 * Words are kept whole where they fit. A single word longer than the line —
 * common in Korean, where a clause can run without spaces — is broken by
 * character, because leaving it intact would push it off the frame.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const lines: string[] = [];
  let current = "";

  const flush = () => {
    if (current) lines.push(current);
    current = "";
  };

  for (const word of normalized.split(" ")) {
    const candidate = current ? `${current} ${word}` : word;

    if (textWidth(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }

    flush();

    if (textWidth(word, fontSize) <= maxWidth) {
      current = word;
      continue;
    }

    for (const character of word) {
      if (textWidth(current + character, fontSize) > maxWidth) flush();
      current += character;
    }
  }

  flush();
  return lines;
}

export function textWidth(text: string, fontSize: number): number {
  let ems = 0;

  for (const character of text) {
    if (character === " ") ems += CHAR_WIDTH_EM.space;
    else if (isWideCharacter(character)) ems += CHAR_WIDTH_EM.wide;
    else ems += CHAR_WIDTH_EM.narrow;
  }

  return ems * fontSize;
}

function isWideCharacter(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;

  // Hangul syllables and jamo, plus CJK ideographs and full-width punctuation.
  return (
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x3000 && code <= 0x303f) ||
    (code >= 0x3130 && code <= 0x318f) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xff00 && code <= 0xff60)
  );
}

/**
 * Stacks a scene's visible text layers, vertically centred, top-anchored, or
 * bottom-anchored according to the caption settings.
 *
 * A layer the settings hide, or one the scene has no text for, is simply
 * absent — the same rule the preview applies.
 */
export function layoutScene(
  scene: Scene,
  captions: CaptionSettings,
  format: RenderFormat,
): LaidOutText[] {
  const { width, height } = frameSize(format);
  const maxWidth = width * (1 - SIDE_PADDING_RATIO * 2);
  const koreanSize = (KOREAN_FONT_SIZE_CQW[captions.fontSize] / 100) * width;

  const requested: { layer: TextLayer; text: string; size: number; opacity: number }[] = [
    { layer: "korean", text: captions.showKorean ? scene.koreanText : "", size: koreanSize, opacity: 1 },
    {
      layer: "romanization",
      text: captions.showRomanization ? scene.romanization : "",
      size: koreanSize * ROMANIZATION_SCALE,
      opacity: 0.75,
    },
    {
      layer: "english",
      text: captions.showEnglish ? scene.englishText : "",
      size: koreanSize * ENGLISH_SCALE,
      opacity: 0.95,
    },
  ];

  const measured = requested
    .map((entry) => {
      const lines = wrapText(entry.text, maxWidth, entry.size);
      const lineHeight = entry.size * LINE_HEIGHT[entry.layer];

      return {
        ...entry,
        lines,
        lineHeight,
        height: lines.length * lineHeight,
      };
    })
    .filter((entry) => entry.lines.length > 0);

  if (measured.length === 0) return [];

  const gap = height * LAYER_GAP_RATIO;
  const blockHeight =
    measured.reduce((total, entry) => total + entry.height, 0) +
    gap * (measured.length - 1);

  let cursor = blockTop(captions.position, height, blockHeight);

  return measured.map((entry) => {
    const laidOut: LaidOutText = {
      layer: entry.layer,
      lines: entry.lines,
      fontSize: Math.round(entry.size),
      lineHeight: Math.round(entry.lineHeight),
      y: Math.round(cursor),
      height: Math.round(entry.height),
      opacity: entry.opacity,
    };

    cursor += entry.height + gap;
    return laidOut;
  });
}

function blockTop(
  position: CaptionSettings["position"],
  frameHeight: number,
  blockHeight: number,
): number {
  const inset = frameHeight * EDGE_INSET_RATIO;

  if (position === "top") return inset;
  if (position === "bottom") return frameHeight - inset - blockHeight;
  return Math.max(inset, (frameHeight - blockHeight) / 2);
}

/** Horizontal padding in pixels, for the alignment expressions. */
export function sidePadding(format: RenderFormat): number {
  return Math.round(frameSize(format).width * SIDE_PADDING_RATIO);
}

/**
 * The two ends of a scene's backdrop gradient, as `0xRRGGBB`.
 *
 * The hue pair is the preview's: the same seed gives the same colours, so a
 * render looks like the preview it was checked in. Real imagery replaces this
 * when the assets stage exists; nothing else has to change.
 */
export function backgroundColors(seed: string): { from: string; to: string } {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 360;
  }

  return {
    from: oklchToHex(0.42, 0.11, hash),
    to: oklchToHex(0.26, 0.08, (hash + 48) % 360),
  };
}

/**
 * OKLCH to sRGB. The preview's gradient is written in OKLCH, and FFmpeg only
 * takes sRGB, so the conversion lives here rather than the two drifting apart.
 */
function oklchToHex(lightness: number, chroma: number, hueDegrees: number): string {
  const hue = (hueDegrees * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const channels = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];

  return `0x${channels.map(toHexChannel).join("")}`;
}

function toHexChannel(linear: number): string {
  const companded =
    linear <= 0.0031308
      ? 12.92 * linear
      : 1.055 * Math.abs(linear) ** (1 / 2.4) - 0.055;

  const clamped = Math.round(Math.min(1, Math.max(0, companded)) * 255);
  return clamped.toString(16).padStart(2, "0");
}
