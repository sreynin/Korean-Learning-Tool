import {
  CONTENT_STYLES,
  PIPELINE_STAGES,
  VISUAL_STYLES,
  producesLongForm,
  producesShorts,
} from "@/types/project";
import type {
  ProficiencyLevel,
  ProjectPipeline,
  ProjectStatus,
  VideoFormat,
  VideoProject,
} from "@/types/project";

interface SeedSpec {
  title: string;
  topic: string;
  description: string;
  format: VideoFormat;
  level: ProficiencyLevel;
  status: ProjectStatus;
}

const SEED_SPECS: SeedSpec[] = [
  {
    title: "Ordering Coffee in Korean",
    topic: "Café ordering phrases and polite endings",
    description: "Everyday café vocabulary with the -요 polite ending.",
    format: "shorts",
    level: "beginner",
    status: "completed",
  },
  {
    title: "5 Ways to Say Thank You",
    topic: "Gratitude expressions across formality levels",
    description: "감사합니다 vs 고마워 vs 고맙습니다 and when each fits.",
    format: "shorts",
    level: "beginner",
    status: "completed",
  },
  {
    title: "Korean Particles 은/는 vs 이/가",
    topic: "Topic and subject particle contrast",
    description: "The single most asked-about grammar point for learners.",
    format: "long",
    level: "intermediate",
    status: "completed",
  },
  {
    title: "Counting in Korean: Native vs Sino",
    topic: "Two number systems and their counters",
    description: "When to use 하나/둘/셋 versus 일/이/삼.",
    format: "long",
    level: "beginner",
    status: "completed",
  },
  {
    title: "Convenience Store Survival Korean",
    topic: "Shopping at a Korean convenience store",
    description: "Payment, bags, and point card phrases.",
    format: "shorts",
    level: "beginner",
    status: "completed",
  },
  {
    title: "Honorifics Made Simple",
    topic: "Speech levels and when to switch",
    description: "Reading the room: 반말, 해요체, and 합쇼체.",
    format: "long",
    level: "advanced",
    status: "in_progress",
  },
  {
    title: "Korean Slang from K-Dramas",
    topic: "Contemporary slang heard in dramas",
    description: "대박, 헐, 꿀잼 and how natural they actually sound.",
    format: "shorts",
    level: "intermediate",
    status: "completed",
  },
  {
    title: "Taxi Korean in 40 Seconds",
    topic: "Giving directions to a taxi driver",
    description: "Destination, stops, and payment in one short ride.",
    format: "shorts",
    level: "beginner",
    status: "completed",
  },
  {
    title: "The Verb 하다 Explained",
    topic: "하다 conjugation and noun-verb compounds",
    description: "Why so many Korean verbs end in 하다.",
    format: "long",
    level: "intermediate",
    status: "completed",
  },
  {
    title: "Hangul in 3 Minutes",
    topic: "Reading the Korean alphabet from scratch",
    description: "Consonants, vowels, and syllable blocks.",
    format: "shorts",
    level: "beginner",
    status: "completed",
  },
  {
    title: "Restaurant Ordering Phrases",
    topic: "Ordering food and asking for the bill",
    description: "From 주문할게요 to 계산해 주세요.",
    format: "shorts",
    level: "beginner",
    status: "completed",
  },
  {
    title: "Past Tense Without the Panic",
    topic: "Forming the Korean past tense",
    description: "았/었/였 and the vowel-harmony rule behind them.",
    format: "long",
    level: "intermediate",
    status: "in_progress",
  },
  {
    title: "Asking for Directions",
    topic: "Navigating a Korean city on foot",
    description: "어디예요? plus the location words you actually need.",
    format: "shorts",
    level: "beginner",
    status: "completed",
  },
  {
    title: "Korean Body Language & Etiquette",
    topic: "Non-verbal etiquette for learners",
    description: "Two-handed giving, bowing depth, and eye contact.",
    format: "long",
    level: "intermediate",
    status: "draft",
  },
  {
    title: "10 Konglish Words That Confuse Everyone",
    topic: "English loanwords with shifted meanings",
    description: "핸드폰, 아파트, 서비스 and other false friends.",
    format: "shorts",
    level: "intermediate",
    status: "completed",
  },
  {
    title: "Making Plans with Friends",
    topic: "Suggesting and scheduling in casual speech",
    description: "-을까? and -자 for natural invitations.",
    format: "shorts",
    level: "intermediate",
    status: "completed",
  },
  {
    title: "Korean Kinship Terms",
    topic: "Family words and fictive kinship",
    description: "언니, 오빠, 누나, 형 — including non-family use.",
    format: "shorts",
    level: "beginner",
    status: "completed",
  },
  {
    title: "Subway Announcements Decoded",
    topic: "Understanding transit announcements",
    description: "The fixed phrases repeated on every Seoul line.",
    format: "shorts",
    level: "intermediate",
    status: "completed",
  },
  {
    title: "Describing Your Day",
    topic: "Sequencing daily routine verbs",
    description: "Connecting clauses with -고 and -아서/어서.",
    format: "shorts",
    level: "beginner",
    status: "draft",
  },
  {
    title: "Korean Job Interview Phrases",
    topic: "Formal self-introduction for interviews",
    description: "자기소개 structure and respectful register.",
    format: "shorts",
    level: "advanced",
    status: "completed",
  },
  {
    title: "Weather Small Talk",
    topic: "Talking about weather and seasons",
    description: "The safest conversation starter in any language.",
    format: "shorts",
    level: "beginner",
    status: "completed",
  },
  {
    title: "Shopping & Bargaining at a Market",
    topic: "Traditional market shopping language",
    description: "Prices, discounts, and polite refusal.",
    format: "shorts",
    level: "intermediate",
    status: "completed",
  },
  {
    title: "Indirect Speech in Korean",
    topic: "Reporting what someone else said",
    description: "-다고 하다 and its contracted forms.",
    format: "shorts",
    level: "advanced",
    status: "draft",
  },
  {
    title: "Pronunciation Rules That Trip Learners Up",
    topic: "Assimilation and liaison in spoken Korean",
    description: "Why 신라 sounds like 실라.",
    format: "shorts",
    level: "intermediate",
    status: "completed",
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Builds the example library that ships on first run so the dashboard has
 * something to show. Timestamps are generated relative to `now` so the data
 * never looks stale.
 */
export function buildSeedProjects(now: Date = new Date()): VideoProject[] {
  return SEED_SPECS.map((spec, index) => {
    const createdAt = new Date(now.getTime() - (SEED_SPECS.length - index) * DAY_MS);
    const updatedAt = new Date(
      createdAt.getTime() + Math.min(index % 5, 3) * (DAY_MS / 2),
    );

    return {
      id: `seed-${String(index + 1).padStart(2, "0")}`,
      title: spec.title,
      topic: spec.topic,
      description: spec.description,
      format: spec.format,
      status: spec.status,
      level: spec.level,
      targetLanguage: "korean",
      // Cycled so the sample library exercises every option in the filters.
      contentStyle: CONTENT_STYLES[index % CONTENT_STYLES.length],
      visualStyle: VISUAL_STYLES[index % VISUAL_STYLES.length],
      shortsDurationSeconds: producesShorts(spec.format) ? 30 : null,
      longDurationSeconds: producesLongForm(spec.format) ? 600 : null,
      lesson: null,
      pipeline: buildPipelineFor(spec.status),
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    } satisfies VideoProject;
  });
}

function buildPipelineFor(status: ProjectStatus): ProjectPipeline {
  const completeThrough =
    status === "completed" ? PIPELINE_STAGES.length : status === "in_progress" ? 5 : 1;

  return Object.fromEntries(
    PIPELINE_STAGES.map((stage, index) => [
      stage,
      {
        status:
          index < completeThrough
            ? "complete"
            : index === completeThrough && status === "in_progress"
              ? "in_progress"
              : "pending",
        updatedAt: index < completeThrough ? new Date().toISOString() : null,
      },
    ]),
  ) as ProjectPipeline;
}
