import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { YouTubeConnectionCard } from "@/components/publish/youtube-connection-card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { getFeatureAvailability, getServerEnv } from "@/lib/env";
import { listProjects } from "@/server/services/project-service";
import { getPublishCapability } from "@/server/services/publish-service";

export const metadata: Metadata = {
  title: "Settings",
};

// Reads runtime environment, which differs from the build environment.
export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: PageProps<"/settings">) {
  const env = getServerEnv();
  const features = getFeatureAvailability();
  const projectCount = (await listProjects()).length;
  const publishCapability = await getPublishCapability();
  const notice = toNotice(await searchParams);

  const integrations = [
    {
      name: "AI lesson generation",
      variable: "AI_API_KEY",
      configured: features.lessonGeneration,
    },
    {
      name: "Voice synthesis",
      variable: "ELEVENLABS_API_KEY",
      configured: features.voiceSynthesis,
    },
    {
      name: "YouTube upload",
      variable: "YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET",
      configured: features.youtubeUpload,
    },
    {
      name: "YouTube token encryption",
      variable: "YOUTUBE_TOKEN_KEY",
      configured: features.youtubeTokenEncryption,
    },
  ];

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Settings"
        description="How this installation is configured."
      />

      <Alert tone="info" className="mb-6">
        Settings are read from environment variables. Edit <code>.env.local</code>{" "}
        and restart the dev server to change them.
      </Alert>

      <YouTubeConnectionCard
        capability={publishCapability}
        notice={notice}
      />

      <Card className="mb-6">
        <CardContent>
          <CardTitle>Integrations</CardTitle>
          <p className="mt-1 text-sm text-foreground-muted">
            Credentials are never sent to the browser — only whether each one is
            present.
          </p>

          <ul className="mt-4 flex flex-col">
            {integrations.map((integration, index) => (
              <li
                key={integration.name}
                className={`flex flex-wrap items-center justify-between gap-3 py-3 ${
                  index > 0 ? "border-t border-border-subtle" : ""
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {integration.name}
                  </p>
                  <p className="font-mono text-xs text-foreground-muted">
                    {integration.variable}
                  </p>
                </div>
                <Badge tone={integration.configured ? "success" : "neutral"}>
                  {integration.configured ? "Configured" : "Not configured"}
                </Badge>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-sm text-foreground-muted">
            Every integration falls back to a mock that returns
            clearly-labelled placeholder content, so the whole flow works
            before you have credentials. A mock upload puts nothing on YouTube
            and says so in its result.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <CardTitle>Storage</CardTitle>
          <dl className="mt-4 flex flex-col gap-3 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-foreground-muted">Backend</dt>
              <dd className="font-medium text-foreground">SQLite via Prisma</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-foreground-muted">Database file</dt>
              <dd className="font-mono text-foreground">{env.DATABASE_URL}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-foreground-muted">Projects stored</dt>
              <dd className="font-medium text-foreground">{projectCount}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * The OAuth callback redirects here with its outcome in the query string.
 *
 * Only ever a short message the callback wrote, never anything from the
 * token exchange.
 */
function toNotice(
  params: Record<string, string | string[] | undefined>,
): { tone: "success" | "danger"; message: string } | undefined {
  const outcome = first(params.youtube);

  if (outcome === "connected") {
    return { tone: "success", message: "YouTube account connected." };
  }

  if (outcome === "error") {
    return {
      tone: "danger",
      message: first(params.message) ?? "The connection could not be completed.",
    };
  }

  return undefined;
}

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.length > 0 ? raw : undefined;
}
