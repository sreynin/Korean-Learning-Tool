import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { getFeatureAvailability, getServerEnv } from "@/lib/env";
import { listProjects } from "@/server/services/project-service";

export const metadata: Metadata = {
  title: "Settings",
};

// Reads runtime environment, which differs from the build environment.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const env = getServerEnv();
  const features = getFeatureAvailability();
  const projectCount = (await listProjects()).length;

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
            Lesson generation works without a key by falling back to a mock
            generator that returns clearly-labelled sample content. Voice and
            YouTube are not implemented yet, so their keys do nothing.
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
