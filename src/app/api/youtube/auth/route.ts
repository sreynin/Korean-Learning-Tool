import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { assertConnectable } from "@/server/services/publish-service";
import { buildAuthorizationUrl, createState } from "@/server/youtube/oauth";

/**
 * Starts the OAuth round trip.
 *
 * A redirect rather than a JSON payload, so the creator lands on Google's own
 * sign-in page. This app never renders a password field and never sees what
 * they type there — what comes back is a one-time code.
 *
 * The signed `state` is set as an httpOnly cookie as well as sent to Google:
 * the callback compares the two, which is what stops a link someone else
 * crafted from completing a connection in this browser.
 */
export const GET = route(async () => {
  assertConnectable();

  const state = createState();
  const response = NextResponse.redirect(buildAuthorizationUrl(state));

  response.cookies.set("youtube_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
    secure: process.env.NODE_ENV === "production",
  });

  return response;
});
