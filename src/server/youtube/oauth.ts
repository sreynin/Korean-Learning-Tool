import { createHmac, randomBytes } from "node:crypto";
import { getServerEnv } from "@/lib/env";
import { AppError, ConflictError } from "@/server/errors";
import { getTokenKey, safeEquals } from "@/server/youtube/token-store";
import { createLogger } from "@/server/logger";

const log = createLogger("youtube");

/**
 * Google OAuth 2.0, authorization-code flow.
 *
 * Plain HTTP against Google's documented endpoints — the same choice as the
 * ElevenLabs provider, and the reason this feature adds no dependency.
 *
 * The app never sees a YouTube password. The creator signs in on Google's own
 * page; what comes back here is a one-time code, exchanged server-side for
 * tokens that are encrypted before they are stored.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

/**
 * The narrowest scopes that do the job.
 *
 * `youtube.upload` can insert a video but cannot read the channel, and
 * `youtube.readonly` is what lets the UI say *which* channel is connected
 * rather than showing an anonymous "connected". Neither can delete a video or
 * touch anything else in the account.
 */
export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
] as const;

export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface TokenSet {
  accessToken: string;
  /** Absent when Google decides the caller already has one. */
  refreshToken: string | null;
  /** ISO 8601 */
  expiresAt: string;
  scopes: string[];
}

/** Credentials, or a clear explanation of what is missing. */
export function getOAuthCredentials(): OAuthCredentials {
  const env = getServerEnv();

  if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET) {
    throw new ConflictError(
      "YouTube is not configured on this installation. Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET, then restart.",
    );
  }

  return {
    clientId: env.YOUTUBE_CLIENT_ID,
    clientSecret: env.YOUTUBE_CLIENT_SECRET,
    redirectUri: env.YOUTUBE_REDIRECT_URI,
  };
}

/**
 * A CSRF token for the round trip to Google.
 *
 * Signed with the same key that encrypts the tokens, so nothing extra has to
 * be configured and no server-side session is needed to remember it: the
 * signature is what proves this app issued it, and the timestamp is what stops
 * an old one being replayed.
 */
export function createState(): string {
  const nonce = randomBytes(16).toString("base64url");
  const issuedAt = Date.now().toString(36);
  const payload = `${nonce}.${issuedAt}`;

  return `${payload}.${signState(payload)}`;
}

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

export function verifyState(state: string | null): boolean {
  if (!state) return false;

  const parts = state.split(".");
  if (parts.length !== 3) return false;

  const [nonce, issuedAt, signature] = parts;
  if (!safeEquals(signature, signState(`${nonce}.${issuedAt}`))) return false;

  const age = Date.now() - parseInt(issuedAt, 36);
  return Number.isFinite(age) && age >= 0 && age < STATE_MAX_AGE_MS;
}

function signState(payload: string): string {
  return createHmac("sha256", getTokenKey()).update(payload).digest("base64url");
}

/**
 * Where to send the creator to approve access.
 *
 * `access_type=offline` is what makes Google issue a refresh token, and
 * `prompt=consent` forces one to be issued even when the creator has approved
 * this app before — without it a reconnect returns an access token only, and
 * the next upload after an hour fails with nothing to refresh from.
 */
export function buildAuthorizationUrl(state: string): string {
  const { clientId, redirectUri } = getOAuthCredentials();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: YOUTUBE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });

  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenSet> {
  const { clientId, clientSecret, redirectUri } = getOAuthCredentials();

  const payload = await postToken({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  if (!payload.access_token) {
    throw new AppError(
      "generation_failed",
      "Google did not return an access token. Try connecting again.",
      502,
    );
  }

  if (!payload.refresh_token) {
    // Without one, the connection dies in an hour with no way to renew it.
    // Better to refuse now than to fail on the creator's first real upload.
    throw new ConflictError(
      "Google did not return a refresh token. Remove this app at myaccount.google.com/permissions and connect again.",
    );
  }

  return toTokenSet(payload, payload.refresh_token);
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenSet> {
  const { clientId, clientSecret } = getOAuthCredentials();

  const payload = await postToken({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });

  if (!payload.access_token) {
    throw new ConflictError(
      "The YouTube connection has expired or been revoked. Reconnect the account.",
    );
  }

  // A refresh response reuses the existing refresh token; Google only sends a
  // new one when it has rotated it.
  return toTokenSet(payload, payload.refresh_token ?? refreshToken);
}

/**
 * Tells Google to forget the grant.
 *
 * Deleting the row alone would leave a live credential on Google's side that
 * the creator can only find in their account settings, so disconnecting here
 * revokes first. A failure is not fatal — the row still goes.
 */
export async function revokeToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(REVOKE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
    });
    return response.ok;
  } catch (error) {
    log.error("could not revoke token", error);
    return false;
  }
}

async function postToken(
  body: Record<string, string>,
): Promise<GoogleTokenResponse> {
  let response: Response;

  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });
  } catch (error) {
    log.error("token endpoint unreachable", error);
    throw new AppError(
      "generation_failed",
      "Could not reach Google. Check your connection and try again.",
      502,
    );
  }

  let payload: GoogleTokenResponse;
  try {
    payload = (await response.json()) as GoogleTokenResponse;
  } catch {
    throw new AppError(
      "generation_failed",
      "Google returned an unreadable response.",
      502,
    );
  }

  if (!response.ok) {
    // `error_description` is Google's own wording and is safe to surface: it
    // describes the request, never the credential.
    const detail = payload.error_description ?? payload.error ?? "unknown error";
    log.error("token exchange failed", { status: response.status, detail });

    if (payload.error === "invalid_grant") {
      throw new ConflictError(
        "Google rejected the authorization — it may have expired or already been used. Connect again.",
      );
    }

    throw new AppError(
      "generation_failed",
      `Google rejected the request: ${detail}`,
      502,
    );
  }

  return payload;
}

function toTokenSet(
  payload: GoogleTokenResponse,
  refreshToken: string | null,
): TokenSet {
  // A minute of slack, so a token that is about to expire is refreshed before
  // an upload starts rather than halfway through it.
  const lifetimeSeconds = (payload.expires_in ?? 3600) - 60;

  return {
    accessToken: payload.access_token as string,
    refreshToken,
    expiresAt: new Date(Date.now() + lifetimeSeconds * 1000).toISOString(),
    scopes: payload.scope ? payload.scope.split(" ") : [...YOUTUBE_SCOPES],
  };
}
