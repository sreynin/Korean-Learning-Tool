import { z } from "zod";

/**
 * Server-side environment. Never import this from a client component —
 * it reads secrets that must not reach the browser.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("file:./data/korean-learning-lab.db"),

  // Lesson generation. Optional on purpose: without a key the app falls back
  // to the mock generator instead of failing to boot.
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().min(1).default("claude-opus-5"),

  // Voice synthesis. Optional: without a key the mock provider is used.
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_MODEL: z.string().min(1).default("eleven_multilingual_v2"),

  // Declared but unused until the matching feature lands.
  YOUTUBE_CLIENT_ID: z.string().optional(),
  YOUTUBE_CLIENT_SECRET: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: emptyToUndefined(process.env.DATABASE_URL),
    AI_API_KEY: emptyToUndefined(process.env.AI_API_KEY),
    AI_MODEL: emptyToUndefined(process.env.AI_MODEL),
    ELEVENLABS_API_KEY: emptyToUndefined(process.env.ELEVENLABS_API_KEY),
    ELEVENLABS_MODEL: emptyToUndefined(process.env.ELEVENLABS_MODEL),
    YOUTUBE_CLIENT_ID: emptyToUndefined(process.env.YOUTUBE_CLIENT_ID),
    YOUTUBE_CLIENT_SECRET: emptyToUndefined(process.env.YOUTUBE_CLIENT_SECRET),
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration.\n${details}\n\nCopy .env.example to .env.local and fill in the values.`,
    );
  }

  cached = parsed.data;
  return cached;
}

/**
 * Feature flags derived from configuration. The UI uses these to disable
 * controls for capabilities that have not been implemented yet.
 */
export function getFeatureAvailability() {
  const env = getServerEnv();
  return {
    lessonGeneration: Boolean(env.AI_API_KEY),
    voiceSynthesis: Boolean(env.ELEVENLABS_API_KEY),
    youtubeUpload: Boolean(env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET),
  };
}

export type FeatureAvailability = ReturnType<typeof getFeatureAvailability>;

function emptyToUndefined(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value : undefined;
}
