import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { getYouTubeAccountRepository } from "@/server/repositories/youtube-account-repository";
import { assertConnectable } from "@/server/services/publish-service";
import { GoogleYouTubeClient } from "@/server/youtube/google-youtube-client";
import { exchangeCodeForTokens, verifyState } from "@/server/youtube/oauth";
import { safeEquals } from "@/server/youtube/token-store";
import { createLogger } from "@/server/logger";

const log = createLogger("youtube");

/**
 * Where Google sends the creator back.
 *
 * This is a browser navigation, not an API call, so it redirects to Settings
 * with a readable outcome instead of returning the JSON envelope. Errors go in
 * the query string; nothing sensitive ever does.
 */
export const GET = route(async (request: Request) => {
  const url = new URL(request.url);
  const settings = new URL("/settings", url.origin);

  const error = url.searchParams.get("error");
  if (error) {
    // The creator pressed "Cancel" on Google's consent screen, or Google
    // refused. Neither is an app failure worth an error page.
    return failure(
      settings,
      error === "access_denied"
        ? "YouTube access was not granted."
        : `Google refused the connection (${error}).`,
    );
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return failure(settings, "Google did not send an authorization code.");
  }

  // Both halves of the CSRF check: the state must be one this app signed, and
  // it must be the same one issued to *this* browser.
  const state = url.searchParams.get("state");
  const cookieState = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("youtube_oauth_state="))
    ?.slice("youtube_oauth_state=".length);

  if (!verifyState(state) || !cookieState || !safeEquals(state as string, cookieState)) {
    return failure(
      settings,
      "That sign-in could not be verified. Start the connection again from this page.",
    );
  }

  try {
    assertConnectable();

    const tokens = await exchangeCodeForTokens(code);

    // Ask which channel the token belongs to before storing anything, so a
    // Google account with no channel fails here rather than on first upload.
    const client = new GoogleYouTubeClient({
      getAccessToken: async () => tokens.accessToken,
    });
    const channel = await client.getChannel();

    await getYouTubeAccountRepository().save({
      channelId: channel.channelId,
      channelTitle: channel.channelTitle,
      scopes: tokens.scopes,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken as string,
      expiresAt: tokens.expiresAt,
    });

    settings.searchParams.set("youtube", "connected");
    return clearState(NextResponse.redirect(settings));
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "The connection could not be completed.";
    log.error("callback failed", message);
    return failure(settings, message);
  }
});

function failure(settings: URL, message: string): NextResponse {
  settings.searchParams.set("youtube", "error");
  settings.searchParams.set("message", message);
  return clearState(NextResponse.redirect(settings));
}

/** The state cookie is single-use whatever the outcome. */
function clearState(response: NextResponse): NextResponse {
  response.cookies.set("youtube_oauth_state", "", { path: "/", maxAge: 0 });
  return response;
}
