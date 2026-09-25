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

  // Rendering. Optional: the renderer searches the usual system font paths for
  // a Korean-capable face, and this overrides that search.
  RENDER_FONT_PATH: z.string().optional(),

  // YouTube publishing. Optional: without a client id and secret the app uses
  // the mock uploader, so the whole connect → fill in → publish flow works
  // before any Google project exists.
  YOUTUBE_CLIENT_ID: z.string().optional(),
  YOUTUBE_CLIENT_SECRET: z.string().optional(),
  // Google matches this against the registered URI exactly, so it is
  // configured rather than derived from a base URL.
  YOUTUBE_REDIRECT_URI: z
    .string()
    .url()
    .default("http://localhost:3000/api/youtube/callback"),
  // 32 bytes, base64 or hex, used to encrypt stored OAuth tokens at rest.
  // Without it the app refuses to store a token rather than writing one in
  // plain text — see src/server/youtube/token-store.ts.
  YOUTUBE_TOKEN_KEY: z.string().optional(),
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
    RENDER_FONT_PATH: emptyToUndefined(process.env.RENDER_FONT_PATH),
    YOUTUBE_CLIENT_ID: emptyToUndefined(process.env.YOUTUBE_CLIENT_ID),
    YOUTUBE_CLIENT_SECRET: emptyToUndefined(process.env.YOUTUBE_CLIENT_SECRET),
    YOUTUBE_REDIRECT_URI: emptyToUndefined(process.env.YOUTUBE_REDIRECT_URI),
    YOUTUBE_TOKEN_KEY: emptyToUndefined(process.env.YOUTUBE_TOKEN_KEY),
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
    // Reported separately: a real upload needs both OAuth credentials *and*
    // somewhere safe to keep the token, and missing the key is the kind of
    // misconfiguration worth naming on its own rather than folding into
    // "not configured".
    youtubeTokenEncryption: Boolean(env.YOUTUBE_TOKEN_KEY),
  };
}

export type FeatureAvailability = ReturnType<typeof getFeatureAvailability>;

function emptyToUndefined(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value : undefined;
}
