"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { ApiClientError, api } from "@/lib/api-client";
import type { PublishCapability } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/utils/format";
import { metadataFormats } from "@/types/metadata";
import type { VideoProject } from "@/types/project";
import type { RenderFormat } from "@/types/render";
import {
  PUBLISH_STATUS_LABELS,
  YOUTUBE_CATEGORIES,
  YOUTUBE_LANGUAGES,
  YOUTUBE_LIMITS,
  YOUTUBE_VISIBILITIES,
  isActivePublish,
} from "@/types/youtube";
import type {
  PublishJob,
  PublishSettings,
  ThumbnailSource,
  YouTubeVisibility,
} from "@/types/youtube";

const FORMAT_LABELS: Record<RenderFormat, string> = {
  shorts: "Short",
  long: "Long-form",
};

const VISIBILITY_HINTS: Record<YouTubeVisibility, string> = {
  private: "Only you can watch it. You can change this on YouTube afterwards.",
  unlisted: "Anyone with the link can watch it. It will not appear in search.",
  public: "Anyone can find and watch it.",
};

/**
 * Publishing a finished render to YouTube.
 *
 * Two things this component will not do. It never submits without the creator
 * pressing Publish and then confirming — there is no autosave path into an
 * upload. And it never claims more than happened: when no credentials are
 * configured it says the upload is simulated, both before and after, because
 * a progress bar that reaches "Published" is otherwise indistinguishable from
 * a real one.
 */
export function PublishPanel({
  project,
  defaults,
  capability,
}: {
  project: VideoProject;
  /** Starting values per cut, computed on the server from the metadata. */
  defaults: Record<string, PublishSettings>;
  capability: PublishCapability;
}) {
  const router = useRouter();

  const formats = metadataFormats(project.format);
  const [format, setFormat] = useState<RenderFormat>(formats[0]);
  const [settings, setSettings] = useState<PublishSettings>(defaults[formats[0]]);
  const [tagText, setTagText] = useState(defaults[formats[0]].tags.join(", "));

  const [job, setJob] = useState<PublishJob | null>(null);
  const [history, setHistory] = useState<PublishJob[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Load past attempts once, so a page refresh mid-upload picks the job back up
  // instead of losing sight of it.
  useEffect(() => {
    let cancelled = false;

    api.publishing
      .list(project.id)
      .then((jobs) => {
        if (cancelled) return;
        setHistory(jobs);
        const active = jobs.find((entry) => isActivePublish(entry.status));
        if (active) setJob(active);
      })
      .catch(() => {
        // A failed history load must not block publishing.
      });

    return () => {
      cancelled = true;
    };
  }, [project.id]);

  usePublishPolling({
    projectId: project.id,
    job,
    onUpdate: setJob,
    onSettled: (settled) => {
      setHistory((previous) => [settled, ...previous.filter((e) => e.id !== settled.id)]);
      router.refresh();
    },
  });

  function switchFormat(next: RenderFormat) {
    setFormat(next);
    setSettings(defaults[next]);
    setTagText(defaults[next].tags.join(", "));
    setConfirming(false);
    setFieldErrors({});
  }

  function update<K extends keyof PublishSettings>(key: K, value: PublishSettings[K]) {
    setSettings((previous) => ({ ...previous, [key]: value }));
    setConfirming(false);
  }

  async function publish() {
    setStarting(true);
    setError(null);
    setFieldErrors({});

    try {
      const result = await api.publishing.start(
        project.id,
        { ...settings, tags: parseTags(tagText) },
        format,
      );
      setJob(result.job);
      setConfirming(false);
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiClientError) {
        setError(cause.message);
        setFieldErrors(cause.fieldErrors);
      } else {
        setError("Could not start the upload.");
      }
    } finally {
      setStarting(false);
    }
  }

  const running = job !== null && isActivePublish(job.status);
  const tags = parseTags(tagText);
  const tagBudget = tags.join(",").length;

  const publishForm = (
    <>
      {formats.length > 1 ? (
        <div className="mt-4 flex gap-1.5">
          {formats.map((option) => (
            <Button
              key={option}
              size="sm"
              variant={option === format ? "primary" : "ghost"}
              onClick={() => switchFormat(option)}
              disabled={running}
            >
              {FORMAT_LABELS[option]}
            </Button>
          ))}
        </div>
      ) : null}

      {job ? (
        <PublishProgress
          job={job}
          onDismiss={() => setJob(null)}
          projectId={project.id}
        />
      ) : null}

      {error ? (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      ) : null}

      <div className="mt-4 flex flex-col gap-4">
        <Field
          label="Title"
          error={fieldErrors.title}
          hint={`${settings.title.length} / ${YOUTUBE_LIMITS.title}`}
          required
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              value={settings.title}
              maxLength={YOUTUBE_LIMITS.title}
              disabled={running}
              onChange={(event) => update("title", event.target.value)}
            />
          )}
        </Field>

        <Field
          label="Description"
          error={fieldErrors.description}
          hint={`${settings.description.length} / ${YOUTUBE_LIMITS.description}`}
        >
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              rows={6}
              value={settings.description}
              maxLength={YOUTUBE_LIMITS.description}
              disabled={running}
              onChange={(event) => update("description", event.target.value)}
            />
          )}
        </Field>

        <Field
          label="Tags"
          error={fieldErrors.tags}
          hint={`Separated by commas. ${tags.length} tag${tags.length === 1 ? "" : "s"}, ${tagBudget} / ${YOUTUBE_LIMITS.tagsTotal} characters.`}
        >
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              rows={2}
              value={tagText}
              disabled={running}
              onChange={(event) => {
                setTagText(event.target.value);
                setConfirming(false);
              }}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Visibility"
            error={fieldErrors.visibility}
            hint={VISIBILITY_HINTS[settings.visibility]}
          >
            {({ id, describedBy, invalid }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                value={settings.visibility}
                disabled={running}
                onChange={(event) =>
                  update("visibility", event.target.value as YouTubeVisibility)
                }
              >
                {YOUTUBE_VISIBILITIES.map((value) => (
                  <option key={value} value={value}>
                    {value[0].toUpperCase() + value.slice(1)}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Category" error={fieldErrors.categoryId}>
            {({ id, describedBy, invalid }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                value={settings.categoryId}
                disabled={running}
                onChange={(event) => update("categoryId", event.target.value)}
              >
                {YOUTUBE_CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            label="Language"
            error={fieldErrors.language}
            hint="The language spoken in the video."
          >
            {({ id, describedBy, invalid }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                value={settings.language}
                disabled={running}
                onChange={(event) => update("language", event.target.value)}
              >
                {YOUTUBE_LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            label="Thumbnail"
            error={fieldErrors.thumbnail}
            hint={
              project.posterUrl
                ? "Custom thumbnails need a verified YouTube channel."
                : "Render the video first to get a still to use."
            }
          >
            {({ id, describedBy, invalid }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                value={settings.thumbnail}
                disabled={running || !project.posterUrl}
                onChange={(event) =>
                  update("thumbnail", event.target.value as ThumbnailSource)
                }
              >
                <option value="render_poster">Still from the render</option>
                <option value="none">Let YouTube choose</option>
              </Select>
            )}
          </Field>
        </div>

        {settings.thumbnail === "render_poster" && project.posterUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element --
             our own route serves this already-sized JPEG from disk. */
          <img
            src={project.posterUrl}
            alt="The still that will be used as the thumbnail"
            className="w-full max-w-64 rounded-lg border border-border-subtle"
          />
        ) : null}
      </div>

      <div className="mt-6 border-t border-border-subtle pt-4">
        {settings.visibility === "public" && !confirming ? (
          <Alert tone="warning" className="mb-3">
            This will be visible to anyone as soon as YouTube finishes
            processing it.
          </Alert>
        ) : null}

        {confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex-1 text-sm text-foreground">
              Upload{" "}
              <span className="font-medium">{FORMAT_LABELS[format]}</span> to{" "}
              <span className="font-medium">
                {capability.connection?.channelTitle ?? "the mock channel"}
              </span>{" "}
              as <span className="font-medium">{settings.visibility}</span>?
            </p>
            <Button loading={starting} onClick={publish}>
              Yes, publish
            </Button>
            <Button
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={starting}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            onClick={() => setConfirming(true)}
            disabled={running || starting || settings.title.trim().length === 0}
          >
            Publish to YouTube
          </Button>
        )}
      </div>

      {history.length > 0 ? <PublishHistory jobs={history} /> : null}
    </>
  );

  if (!capability.configured) {
    return (
      <Card>
        <CardContent>
          <CardTitle>Publish to YouTube</CardTitle>
          <Alert tone="warning" className="mt-4">
            YouTube is not configured on this installation, so uploads are
            simulated. Set <code>YOUTUBE_CLIENT_ID</code> and{" "}
            <code>YOUTUBE_CLIENT_SECRET</code> to publish for real — the form
            below works either way, and a simulated publish says so in its
            result.
          </Alert>
          {publishForm}
        </CardContent>
      </Card>
    );
  }

  if (!capability.connection) {
    return (
      <Card>
        <CardContent>
          <CardTitle>Publish to YouTube</CardTitle>
          <p className="mt-1 text-sm text-foreground-muted">
            Connect a YouTube channel in Settings before publishing. You sign in
            on Google — this app never sees your password.
          </p>
          <Button className="mt-4" onClick={() => router.push("/settings")}>
            Go to Settings
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Publish to YouTube</CardTitle>
            <p className="mt-1 text-sm text-foreground-muted">
              Uploading to{" "}
              <span className="font-medium text-foreground">
                {capability.connection.channelTitle}
              </span>
              .
            </p>
          </div>
          {capability.uploadsForReal ? null : (
            <Badge tone="warning">Simulated — nothing is uploaded</Badge>
          )}
        </div>

        {publishForm}
      </CardContent>
    </Card>
  );

}

/** Live state of the upload: Uploading… → Processing… → Published. */
function PublishProgress({
  job,
  projectId,
  onDismiss,
}: {
  job: PublishJob;
  projectId: string;
  onDismiss: () => void;
}) {
  const label = PUBLISH_STATUS_LABELS[job.status];
  const running = isActivePublish(job.status);

  return (
    <div className="mt-4 rounded-lg border border-border-subtle p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {job.status === "uploading" ? (
          <p className="text-sm text-foreground-muted">{job.progress}%</p>
        ) : null}
      </div>

      {running ? (
        <Progress
          className="mt-3"
          // Processing has no percentage of its own — YouTube does not report
          // one — so the bar stays full and the label carries the meaning.
          value={job.status === "uploading" ? job.progress : 100}
          max={100}
          label={label}
        />
      ) : null}

      {job.status === "processing" ? (
        <p className="mt-2 text-sm text-foreground-muted">
          The file is on YouTube. It is being transcoded, which can take a few
          minutes for a long video.
        </p>
      ) : null}

      {job.status === "completed" && job.publication ? (
        <div className="mt-3 flex flex-col gap-2">
          <Alert tone="success">
            Published as {job.publication.visibility}.
          </Alert>
          <dl className="grid gap-1 text-sm">
            <Row label="Video ID" value={job.publication.videoId} mono />
            <Row
              label="URL"
              value={
                <a
                  href={job.publication.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent underline"
                >
                  {job.publication.videoUrl}
                </a>
              }
            />
            <Row
              label="Published"
              value={formatRelativeTime(job.publication.publishedAt)}
            />
            <Row label="Project" value={projectId} mono />
          </dl>
          {job.provider === "mock" ? (
            <Alert tone="warning">
              No YouTube credentials are configured, so nothing was uploaded.
              That video ID and link are placeholders and will not resolve.
            </Alert>
          ) : null}
        </div>
      ) : null}

      {job.warningMessage ? (
        <Alert tone="warning" className="mt-3">
          {job.warningMessage}
        </Alert>
      ) : null}

      {job.status === "failed" ? (
        <Alert tone="danger" className="mt-3">
          {job.errorMessage ?? "The upload failed."}
        </Alert>
      ) : null}

      {running ? null : (
        <Button variant="ghost" size="sm" className="mt-3" onClick={onDismiss}>
          Dismiss
        </Button>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <dt className="text-foreground-muted">{label}</dt>
      <dd className={mono ? "font-mono text-foreground" : "text-foreground"}>
        {value}
      </dd>
    </div>
  );
}

function PublishHistory({ jobs }: { jobs: PublishJob[] }) {
  return (
    <div className="mt-6 border-t border-border-subtle pt-4">
      <h3 className="text-sm font-medium text-foreground">Previous attempts</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {jobs.slice(0, 5).map((job) => (
          <li
            key={job.id}
            className="flex flex-wrap items-center gap-2 text-sm text-foreground-muted"
          >
            <Badge tone={job.status === "completed" ? "success" : "neutral"}>
              {PUBLISH_STATUS_LABELS[job.status]}
            </Badge>
            <span>{FORMAT_LABELS[job.format]}</span>
            <span>{formatRelativeTime(job.createdAt)}</span>
            {job.publication ? (
              <a
                href={job.publication.videoUrl}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-accent underline"
              >
                {job.publication.videoId}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Polls an in-flight job.
 *
 * Stops as soon as the job settles, and on unmount, so a creator who navigates
 * away does not leave a request loop behind.
 */
function usePublishPolling({
  projectId,
  job,
  onUpdate,
  onSettled,
}: {
  projectId: string;
  job: PublishJob | null;
  onUpdate: (job: PublishJob) => void;
  onSettled: (job: PublishJob) => void;
}) {
  const settledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!job || !isActivePublish(job.status)) return;

    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const next = await api.publishing.get(projectId, job.id);
        if (cancelled) return;

        onUpdate(next);

        if (!isActivePublish(next.status) && settledRef.current !== next.id) {
          settledRef.current = next.id;
          onSettled(next);
        }
      } catch {
        // A dropped poll is not worth surfacing; the next one will catch up.
      }
    }, 1500);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [projectId, job, onUpdate, onSettled]);
}

/** Commas or newlines, whichever the creator used. */
function parseTags(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}
