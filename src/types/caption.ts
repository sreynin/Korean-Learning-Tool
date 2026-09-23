/**
 * Caption presentation.
 *
 * Captions are not separate text: they are how a scene's existing
 * `koreanText`, `romanization`, and `englishText` are drawn on the frame.
 * Duplicating the strings would let the subtitle and the storyboard drift
 * apart, so these settings govern the same fields the preview already reads.
 *
 * Settings are per project (one consistent look across the video); the
 * highlighted vocabulary is per scene.
 */

export const CAPTION_FONT_SIZES = ["small", "medium", "large", "xlarge"] as const;
export type CaptionFontSize = (typeof CAPTION_FONT_SIZES)[number];

export const CAPTION_POSITIONS = ["top", "center", "bottom"] as const;
export type CaptionPosition = (typeof CAPTION_POSITIONS)[number];

export const CAPTION_ALIGNMENTS = ["left", "center", "right"] as const;
export type CaptionAlignment = (typeof CAPTION_ALIGNMENTS)[number];

export const CAPTION_ANIMATIONS = ["none", "fade", "slide_up", "pop"] as const;
export type CaptionAnimation = (typeof CAPTION_ANIMATIONS)[number];

export interface CaptionSettings {
  fontSize: CaptionFontSize;
  position: CaptionPosition;
  alignment: CaptionAlignment;
  animation: CaptionAnimation;
  showKorean: boolean;
  showEnglish: boolean;
  showRomanization: boolean;
}

export const DEFAULT_CAPTION_SETTINGS: CaptionSettings = {
  fontSize: "medium",
  position: "center",
  alignment: "center",
  animation: "fade",
  showKorean: true,
  showEnglish: true,
  showRomanization: true,
};

/**
 * Korean font size as a share of frame width, in container-query units, so
 * captions scale with the frame exactly as the rest of the preview does.
 * The other two layers are derived from this.
 */
export const KOREAN_FONT_SIZE_CQW: Record<CaptionFontSize, number> = {
  small: 6.5,
  medium: 9,
  large: 11.5,
  xlarge: 14,
};

export const ROMANIZATION_SCALE = 0.45;
export const ENGLISH_SCALE = 0.56;

/**
 * A run of caption text, marked as highlighted or not. Splitting happens once
 * and both the preview and any future renderer consume the same result.
 */
export interface CaptionSegment {
  text: string;
  highlighted: boolean;
}

/**
 * Splits `text` around every occurrence of any term in `terms`.
 *
 * Longer terms are matched first so an overlapping shorter term cannot claim
 * part of a longer one. Matching is plain substring, which is what Korean
 * needs: a highlight usually covers a stem inside a longer eojeol, as in
 * 저는 [김치]를 좋아해요.
 */
export function segmentCaption(
  text: string,
  terms: string[],
): CaptionSegment[] {
  const cleaned = terms
    .map((term) => term.trim())
    .filter((term) => term.length > 0)
    .sort((a, b) => b.length - a.length);

  if (!text || cleaned.length === 0) {
    return text ? [{ text, highlighted: false }] : [];
  }

  const segments: CaptionSegment[] = [];
  let index = 0;

  while (index < text.length) {
    const match = cleaned.find((term) => text.startsWith(term, index));

    if (match) {
      segments.push({ text: match, highlighted: true });
      index += match.length;
    } else {
      const previous = segments[segments.length - 1];
      if (previous && !previous.highlighted) {
        previous.text += text[index];
      } else {
        segments.push({ text: text[index], highlighted: false });
      }
      index += 1;
    }
  }

  return segments;
}
