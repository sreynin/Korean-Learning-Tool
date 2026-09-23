import type { BadgeTone } from "@/components/ui/badge";
import type {
  ContentStyle,
  LongDuration,
  PipelineStage,
  ProficiencyLevel,
  ProjectStatus,
  ShortsDuration,
  StageStatus,
  TargetLanguage,
  VideoFormat,
  VisualStyle,
} from "@/types/project";

export const APP_NAME = "Korean Learning Lab";

export interface NavItem {
  href: string;
  label: string;
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", description: "Overview and recent activity" },
  { href: "/create", label: "Create", description: "Start a new video" },
  { href: "/projects", label: "Projects", description: "Your video library" },
  { href: "/settings", label: "Settings", description: "App configuration" },
];

export const STATUS_META: Record<
  ProjectStatus,
  { label: string; tone: BadgeTone }
> = {
  draft: { label: "Draft", tone: "neutral" },
  in_progress: { label: "In progress", tone: "warning" },
  completed: { label: "Completed", tone: "success" },
};

export const FORMAT_META: Record<
  VideoFormat,
  { label: string; shortLabel: string; description: string; tone: BadgeTone }
> = {
  shorts: {
    label: "YouTube Short",
    shortLabel: "Short",
    description: "Vertical, 60 seconds or less. One idea per video.",
    tone: "info",
  },
  long: {
    label: "YouTube Long Video",
    shortLabel: "Long",
    description: "Horizontal, several minutes. Room to teach in depth.",
    tone: "accent",
  },
  both: {
    label: "Both",
    shortLabel: "Both",
    description: "One lesson, cut into a Short and a long-form video.",
    tone: "brand",
  },
};

export const LEVEL_META: Record<ProficiencyLevel, { label: string }> = {
  beginner: { label: "Beginner" },
  elementary: { label: "Elementary" },
  intermediate: { label: "Intermediate" },
  advanced: { label: "Advanced" },
};

export const TARGET_LANGUAGE_META: Record<TargetLanguage, { label: string }> = {
  korean: { label: "Korean" },
  english: { label: "English" },
  chinese: { label: "Chinese" },
};

export const CONTENT_STYLE_META: Record<ContentStyle, { label: string }> = {
  vocabulary: { label: "Vocabulary" },
  grammar: { label: "Grammar" },
  conversation: { label: "Conversation" },
  pronunciation: { label: "Pronunciation" },
  quiz: { label: "Quiz" },
  culture: { label: "Korean Culture" },
  food: { label: "Korean Food" },
  travel: { label: "Travel Korean" },
};

export const VISUAL_STYLE_META: Record<VisualStyle, { label: string }> = {
  clean_educational: { label: "Clean Educational" },
  korean_lifestyle: { label: "Korean Lifestyle" },
  cartoon: { label: "Cartoon" },
  minimal: { label: "Minimal" },
  realistic: { label: "Realistic" },
};

export const SHORTS_DURATION_LABELS: Record<ShortsDuration, string> = {
  15: "15 seconds",
  30: "30 seconds",
  60: "60 seconds",
};

export const LONG_DURATION_LABELS: Record<LongDuration, string> = {
  180: "3 minutes",
  300: "5 minutes",
  600: "10 minutes",
};

export const STAGE_STATUS_META: Record<
  StageStatus,
  { label: string; tone: BadgeTone }
> = {
  pending: { label: "Pending", tone: "neutral" },
  in_progress: { label: "In progress", tone: "warning" },
  complete: { label: "Complete", tone: "success" },
};

/**
 * The production pipeline as shown in the editor. `implemented` gates the UI:
 * only the topic step exists today, so every other step renders as read-only.
 */
export const STAGE_META: Record<
  PipelineStage,
  { label: string; description: string; implemented: boolean }
> = {
  topic: {
    label: "Topic",
    description: "The subject, level, and format of the lesson.",
    implemented: true,
  },
  lesson: {
    label: "AI lesson",
    description: "Generated vocabulary, grammar points, and examples.",
    implemented: true,
  },
  script: {
    label: "Script",
    description: "Narration written from the lesson plan.",
    implemented: false,
  },
  scenes: {
    label: "Scenes",
    description: "The script split into timed scenes.",
    implemented: false,
  },
  visuals: {
    label: "Visuals",
    description: "Imagery and on-screen text for each scene.",
    implemented: false,
  },
  voice: {
    label: "Voice",
    description: "Synthesised Korean and English narration.",
    implemented: false,
  },
  captions: {
    label: "Captions",
    description: "Burned-in captions and romanisation.",
    implemented: false,
  },
  preview: {
    label: "Preview",
    description: "Assembled video for review before export.",
    implemented: false,
  },
  export: {
    label: "Export",
    description: "Final render at the target resolution.",
    implemented: false,
  },
  youtube: {
    label: "YouTube metadata",
    description: "Title, description, tags, and thumbnail.",
    implemented: false,
  },
};
