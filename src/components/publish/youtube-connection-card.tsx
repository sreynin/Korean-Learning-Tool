"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { ApiClientError, api } from "@/lib/api-client";
import { cn } from "@/lib/utils/cn";
import type { PublishCapability } from "@/lib/api-client";
import { formatDate } from "@/lib/utils/format";

/**
 * Connecting a YouTube channel.
 *
 * The connect button is a plain link to `/api/youtube/auth`, which redirects
 * to Google. That is deliberate: sign-in happens on Google's page, in the
 * address bar the creator can check, and this app never renders a password
 * field or sees what is typed into one.
 *
 * Nothing here ever receives a token. The only thing the API returns is which
 * channel is connected.
 */
export function YouTubeConnectionCard({
  capability: initial,
  notice,
}: {
  capability: PublishCapability;
  /** Outcome of a callback redirect, if the creator just came back. */
  notice?: { tone: "success" | "danger"; message: string };
}) {
  const router = useRouter();

  const [capability, setCapability] = useState(initial);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function disconnect() {
    setDisconnecting(true);
    setError(null);

    try {
      setCapability(await api.youtube.disconnect());
      setConfirming(false);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : "Could not disconnect the account.",
      );
    } finally {
      setDisconnecting(false);
    }
  }

  const { connection } = capability;

  return (
    <Card className="mb-6">
      <CardContent>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>YouTube account</CardTitle>
            <p className="mt-1 text-sm text-foreground-muted">
              Publishing uses YouTube&rsquo;s official API and Google sign-in.
              This app never sees or stores your password.
            </p>
          </div>
          <Badge tone={connection ? "success" : "neutral"}>
            {connection ? "Connected" : "Not connected"}
          </Badge>
        </div>

        {notice ? (
          <Alert tone={notice.tone} className="mt-4">
            {notice.message}
          </Alert>
        ) : null}

        {error ? (
          <Alert tone="danger" className="mt-4">
            {error}
          </Alert>
        ) : null}

        {!capability.configured ? (
          <Alert tone="info" className="mt-4">
            Set <code>YOUTUBE_CLIENT_ID</code> and{" "}
            <code>YOUTUBE_CLIENT_SECRET</code> from a Google Cloud project with
            the YouTube Data API v3 enabled, then restart. Until then the
            publish form runs against a mock that uploads nothing.
          </Alert>
        ) : null}

        {capability.configured && !capability.canStoreTokens ? (
          <Alert tone="danger" className="mt-4">
            <code>YOUTUBE_TOKEN_KEY</code> is not set, so there is nowhere safe
            to keep a YouTube token — connecting is blocked rather than storing
            one in plain text. Generate one with{" "}
            <code>openssl rand -base64 32</code>, set it, and restart.
          </Alert>
        ) : null}

        {connection ? (
          <>
            <dl className="mt-4 flex flex-col gap-3 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-foreground-muted">Channel</dt>
                <dd className="font-medium text-foreground">
                  {connection.channelTitle}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-foreground-muted">Channel ID</dt>
                <dd className="font-mono text-xs text-foreground">
                  {connection.channelId}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-foreground-muted">Connected</dt>
                <dd className="text-foreground">
                  {formatDate(connection.connectedAt)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-foreground-muted">Access granted</dt>
                <dd className="text-right text-xs text-foreground-muted">
                  {connection.scopes.length > 0
                    ? connection.scopes
                        .map((scope) => scope.split("/").pop())
                        .join(", ")
                    : "unknown"}
                </dd>
              </div>
            </dl>

            {confirming ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <p className="flex-1 text-sm text-foreground-muted">
                  This revokes the app&rsquo;s access with Google and removes
                  the stored token. Videos already published stay on YouTube.
                </p>
                <Button
                  variant="danger"
                  size="sm"
                  loading={disconnecting}
                  onClick={disconnect}
                >
                  Disconnect
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirming(false)}
                  disabled={disconnecting}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="secondary"
                className="mt-4"
                onClick={() => setConfirming(true)}
              >
                Disconnect
              </Button>
            )}
          </>
        ) : (
          /* A plain anchor, not a router push: this route answers with a
             redirect to Google, and the creator has to actually land on
             Google's own page — in an address bar they can check — to sign
             in. A client-side navigation would never leave the app. */
          <a
            href="/api/youtube/auth"
            aria-disabled={
              !capability.configured || !capability.canStoreTokens || undefined
            }
            className={buttonClasses(
              "primary",
              "md",
              cn(
                "mt-4",
                !capability.configured || !capability.canStoreTokens
                  ? "pointer-events-none opacity-50"
                  : "",
              ),
            )}
          >
            Connect YouTube account
          </a>
        )}
      </CardContent>
    </Card>
  );
}
