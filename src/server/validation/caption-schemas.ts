import { z } from "zod";
import {
  CAPTION_ALIGNMENTS,
  CAPTION_ANIMATIONS,
  CAPTION_FONT_SIZES,
  CAPTION_POSITIONS,
} from "@/types/caption";

export const captionSettingsSchema = z.object({
  fontSize: z.enum(CAPTION_FONT_SIZES),
  position: z.enum(CAPTION_POSITIONS),
  alignment: z.enum(CAPTION_ALIGNMENTS),
  animation: z.enum(CAPTION_ANIMATIONS),
  showKorean: z.boolean(),
  showEnglish: z.boolean(),
  showRomanization: z.boolean(),
});
