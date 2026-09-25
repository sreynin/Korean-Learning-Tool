import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { getPublishJobRepository } from "@/server/repositories/publish-job-repository";
import { getRenderJobRepository } from "@/server/repositories/render-job-repository";
import { getYouTubeAccountRepository } from "@/server/repositories/youtube-account-repository";
import { getProject } from "@/server/services/project-service";
import { resolveRenderFormat } from "@/server/services/render-service";
import { getPublishQueue } from "@/server/youtube/publish-queue";
import { getYouTubeClient, isYouTubeConfigured } from "@/server/youtube";
import { canStoreTokens } from "@/server/youtube/token-store";
import {
  DEFAULT_CATEGORY_ID,
  DEFAULT_LANGUAGE_CODE,
  DEFAULT_VISIBILITY,
} from "@/types/youtube";
import { metadataFor } from "@/types/metadata";
import type { RenderFormat } from "@/types/render";
import type { VideoProject } from "@/types/project";
import type {
  PublishFormat,
  PublishJob,
  PublishSettings,
  YouTubeConnection,
} from "@/types/youtube";

/**
 * Publishing a finished render to YouTube.
 *
 * Every rule about *when* a publish may happen lives here, not in the route
 * and not in the panel. The important one: this service is only ever reached
 * from a request the creator made on purpose. Nothing in the app calls
 * `startPublish` on a timer, on a render finishing, or as a side effect of
 * anything else.
 */

export interface PublishCapability {
  /** Whether OAuth credentials are configured at all. */
  configured: boolean;
  /** Whether tokens can be stored safely — see YOUTUBE_TOKEN_KEY. */
  canStoreTokens: boolean;
  /** Whether an upload would really reach YouTube, or only the mock. */
  uploadsForReal: boolean;
  connection: YouTubeConnection | null;
}

export async function getPublishCapability(): Promise<PublishCapability> {
  const configured = isYouTubeConfigured();

  return {
    configured,
    canStoreTokens: canStoreTokens(),
    uploadsForReal: getYouTubeClient().uploadsForReal,
    connection: configured
      ? await getYouTubeAccountRepository().getConnection()
      : null,
  };
}

export async function disconnectYouTube(): Promise<void> {
  const accounts = getYouTubeAccountRepository();
  const account = await accounts.getAccount().catch(() => null);

  // Revoke on Google's side first, so disconnecting here does not leave a live
  // grant the creator can only find in their own account settings.
  if (account) {
    const { revokeToken } = await import("@/server/youtube/oauth");
    await revokeToken(account.refreshToken);
  }

  await accounts.clear();
}

export interface StartPublishResult {
  job: PublishJob;
  project: VideoProject;
}

/**
 * Creates a publish job and hands it to the queue.
 *
 * Returns as soon as the row exists — it never waits for the upload, which is
 * why the route has no long `maxDuration`.
 */
export async function startPublish(
  projectId: string,
  input: PublishSettings & { format?: RenderFormat },
): Promise<StartPublishResult> {
  const project = await getProject(projectId);
  const format = resolveRenderFormat(project, input.format);

  await assertPublishable(project, format);

  const jobs = getPublishJobRepository();
  const client = getYouTubeClient();

  // `format` was resolved above; what is stored is the settings alone.
  const { format: submittedFormat, ...settings } = input;
  void submittedFormat;

  const job = await jobs.createIfIdle({
    projectId,
    format,
    settings,
    provider: client.name,
  });

  if (!job) {
    throw new ConflictError(
      "This project is already being published. Wait for that to finish before starting another.",
    );
  }

  await getPublishQueue().enqueue(job.id);

  return {
    job: (await jobs.findById(job.id)) ?? job,
    project: await getProject(projectId),
  };
}

export async function getPublishJob(
  projectId: string,
  jobId: string,
): Promise<PublishJob> {
  const job = await getPublishJobRepository().findById(jobId);

  if (!job || job.projectId !== projectId) {
    throw new NotFoundError(`No publish job found with id "${jobId}".`);
  }

  return job;
}

export async function listPublishJobs(projectId: string): Promise<PublishJob[]> {
  await getProject(projectId);
  return getPublishJobRepository().listForProject(projectId);
}

/**
 * What must be true before a publish can start.
 *
 * Checked in the order a creator would hit them, so the first message they see
 * is the first thing they have to fix.
 */
export async function assertPublishable(
  project: VideoProject,
  format: PublishFormat,
): Promise<void> {
  if (isYouTubeConfigured() && !canStoreTokens()) {
    throw new ConflictError(
      "YOUTUBE_TOKEN_KEY is not set, so this installation cannot keep a YouTube token safely. Set one and restart before connecting an account.",
    );
  }

  if (isYouTubeConfigured()) {
    const connection = await getYouTubeAccountRepository().getConnection();

    if (!connection) {
      throw new ConflictError(
        "No YouTube account is connected. Connect one in Settings before publishing.",
      );
    }
  }

  const renders = await getRenderJobRepository().listForProject(project.id);
  const finished = renders.some(
    (job) => job.format === format && job.status === "completed" && job.outputUrl,
  );

  if (!finished) {
    throw new ConflictError(
      format === "shorts"
        ? "This project's Short has not been rendered yet. Render it before publishing."
        : "This project's long-form video has not been rendered yet. Render it before publishing.",
    );
  }
}

/**
 * Sensible starting values for the form, taken from what the project already
 * knows.
 *
 * The creator sees and can change every one of them before anything is sent —
 * these are a starting point, not a submission. Visibility is the exception
 * worth stating: it starts `private` regardless of anything stored, because
 * the cost of a wrong default is a video the world can see.
 */
export function defaultPublishSettings(
  project: VideoProject,
  format: PublishFormat,
): PublishSettings {
  const stored = metadataFor(project.metadata, format);
  const content = stored?.content;

  const description = content
    ? [content.description, content.hashtags.join(" ")]
        .filter((part) => part.trim().length > 0)
        .join("\n\n")
    : "";

  return {
    title: content?.title ?? project.title,
    description,
    tags: content?.tags ?? [],
    visibility: DEFAULT_VISIBILITY,
    categoryId: DEFAULT_CATEGORY_ID,
    language: toYouTubeLanguage(project.targetLanguage),
    thumbnail: project.posterUrl ? "render_poster" : "none",
  };
}

/** The lesson's explanation language is the language of the audio. */
function toYouTubeLanguage(targetLanguage: VideoProject["targetLanguage"]): string {
  switch (targetLanguage) {
    case "korean":
      return "ko";
    case "chinese":
      return "zh";
    default:
      return DEFAULT_LANGUAGE_CODE;
  }
}

/** Guards the OAuth callback against a project-less or misconfigured install. */
export function assertConnectable(): void {
  if (!isYouTubeConfigured()) {
    throw new ValidationError(
      "YouTube is not configured on this installation. Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET, then restart.",
    );
  }

  if (!canStoreTokens()) {
    throw new ConflictError(
      "YOUTUBE_TOKEN_KEY is not set, so a YouTube token cannot be stored safely. Generate one with `openssl rand -base64 32`, set it, and restart.",
    );
  }
}
