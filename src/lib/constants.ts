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
import type {
  SceneAnimation,
  SceneTransition,
  SceneType,
} from "@/types/scene";

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
  lesson_ready: { label: "Lesson ready", tone: "info" },
  scenes_ready: { label: "Scenes ready", tone: "info" },
  voice_ready: { label: "Voice ready", tone: "accent" },
  ready_to_render: { label: "Ready to render", tone: "accent" },
  rendering: { label: "Rendering", tone: "warning" },
  completed: { label: "Completed", tone: "success" },
  published: { label: "Published", tone: "brand" },
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

export const SCENE_TYPE_META: Record<
  SceneType,
  { label: string; tone: BadgeTone }
> = {
  hook: { label: "Hook", tone: "brand" },
  vocabulary: { label: "Vocabulary", tone: "info" },
  grammar: { label: "Grammar", tone: "info" },
  example: { label: "Example", tone: "accent" },
  explanation: { label: "Explanation", tone: "accent" },
  quiz: { label: "Quiz", tone: "warning" },
  answer: { label: "Answer", tone: "success" },
  practice: { label: "Practice", tone: "neutral" },
  outro: { label: "Outro", tone: "brand" },
};

export const SCENE_ANIMATION_LABELS: Record<SceneAnimation, string> = {
  none: "None",
  fade_in: "Fade in",
  slide_up: "Slide up",
  slide_left: "Slide left",
  pop: "Pop",
  zoom_in: "Zoom in",
  typewriter: "Typewriter",
};

export const SCENE_TRANSITION_LABELS: Record<SceneTransition, string> = {
  cut: "Cut",
  fade: "Fade",
  slide: "Slide",
  zoom: "Zoom",
  dissolve: "Dissolve",
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
 * a step with `implemented: false` renders read-only with a "Coming soon"
 * badge instead of an action.
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
  scenes: {
    label: "Scenes",
    description:
      "The lesson split into a timed, editable storyboard. Each scene's narration is the spoken script.",
    implemented: true,
  },
  assets: {
    label: "Assets",
    description: "Imagery and on-screen text generated for each scene.",
    implemented: false,
  },
  voice: {
    label: "Voice",
    description: "Narration from each scene, synthesised to audio.",
    implemented: true,
  },
  captions: {
    label: "Captions",
    description:
      "On-screen Korean, romanization, and translation, with highlighted vocabulary.",
    implemented: true,
  },
  preview: {
    label: "Preview",
    description: "Browser playback of the storyboard, at the final frame size.",
    implemented: true,
  },
  render: {
    label: "Render",
    description: "Final MP4 at the target resolution, encoded from the storyboard.",
    implemented: true,
  },
  youtube: {
    label: "YouTube metadata",
    description:
      "Title, description, hashtags, tags, thumbnail text, and a pinned comment.",
    implemented: true,
  },
};
