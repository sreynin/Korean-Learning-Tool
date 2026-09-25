import { getServerEnv } from "@/lib/env";
import { ConflictError } from "@/server/errors";
import { getYouTubeAccountRepository } from "@/server/repositories/youtube-account-repository";
import { GoogleYouTubeClient } from "@/server/youtube/google-youtube-client";
import { MockYouTubeClient } from "@/server/youtube/mock-youtube-client";
import { refreshAccessToken } from "@/server/youtube/oauth";
import type { YouTubeAccountRepository } from "@/server/repositories/youtube-account-repository";
import type { YouTubeClient } from "@/server/youtube/youtube-client";

/**
 * Single composition point for YouTube.
 *
 * Without OAuth credentials the app uses the mock uploader rather than
 * refusing to run, matching lesson generation and voice. The difference is
 * that a mock upload is much easier to mistake for a real one, so
 * `uploadsForReal` is on the interface and the UI says plainly which it has.
 *
 * Deliberately **not** cached on `globalThis` like the other providers: the
 * real client closes over a token supplier bound to the account row, and a
 * cached instance would outlive a disconnect and keep a revoked credential
 * reachable.
 */
export function getYouTubeClient(): YouTubeClient {
  const env = getServerEnv();

  if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET) {
    return new MockYouTubeClient();
  }

  return new GoogleYouTubeClient({
    getAccessToken: () => getValidAccessToken(),
  });
}

export function isYouTubeConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET);
}

/**
 * Returns a usable access token, refreshing it when it has expired.
 *
 * The refreshed pair is written back before it is used, so a process that dies
 * mid-upload does not leave the stored token behind the one Google now
 * expects.
 */
export async function getValidAccessToken(
  accounts: YouTubeAccountRepository = getYouTubeAccountRepository(),
): Promise<string> {
  const account = await accounts.getAccount();

  if (!account) {
    throw new ConflictError(
      "No YouTube account is connected. Connect one in Settings before publishing.",
    );
  }

  if (new Date(account.expiresAt).getTime() > Date.now()) {
    return account.accessToken;
  }

  const refreshed = await refreshAccessToken(account.refreshToken);

  await accounts.updateTokens({
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? account.refreshToken,
    expiresAt: refreshed.expiresAt,
  });

  return refreshed.accessToken;
}

export type { YouTubeClient };
