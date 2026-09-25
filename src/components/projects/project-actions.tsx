"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { ApiClientError, api } from "@/lib/api-client";
import { cn } from "@/lib/utils/cn";
import { metadataFor, metadataFormats } from "@/types/metadata";
import type { VideoProject } from "@/types/project";

type Busy = "duplicating" | "rendering" | "publishing" | "deleting" | null;

/**
 * The actions on a library card.
 *
 * Everything that changes data goes through the API and then refreshes the
 * server-rendered list, so the card's status and thumbnail come from the same
 * derivation as the rest of the app rather than from local guesswork.
 */
export function ProjectActions({ project }: { project: VideoProject }) {
  const router = useRouter();

  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  // Publishing and deleting confirm inline rather than through window.prompt
  // or window.confirm: those are blocked outright in embedded and sandboxed
  // browsers, and a blocked dialog fails the action with nothing on screen.
  const [publishUrl, setPublishUrl] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const hasScenes = (project.scenes?.scenes.length ?? 0) > 0;
  const rendering = project.status === "rendering";
  const outputUrl = project.latestRender?.outputUrl ?? null;
  const metadata = metadataFor(project.metadata, metadataFormats(project.format)[0]);
  const working = busy !== null;

  async function run(action: Busy, work: () => Promise<unknown>, fallback: string) {
    setBusy(action);
    setError(null);

    try {
      await work();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : fallback);
    } finally {
      setBusy(null);
    }
  }

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setError("Could not copy to the clipboard.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <ButtonLink href={`/projects/${project.id}`} variant="secondary" size="sm">
          Edit
        </ButtonLink>

        {hasScenes ? (
          <ButtonLink
            href={`/projects/${project.id}/preview`}
            variant="ghost"
            size="sm"
          >
            Preview
          </ButtonLink>
        ) : null}

        <Button
          variant="ghost"
          size="sm"
          loading={busy === "duplicating"}
          disabled={working}
          onClick={() =>
            run(
              "duplicating",
              () => api.projects.duplicate(project.id),
              "Could not duplicate this project.",
            )
          }
        >
          Duplicate
        </Button>

        <Button
          variant="ghost"
          size="sm"
          loading={busy === "rendering" || rendering}
          disabled={working || rendering || !hasScenes}
          title={hasScenes ? undefined : "Generate a storyboard first"}
          onClick={() =>
            run(
              "rendering",
              () => api.renders.start(project.id),
              "Could not start a render.",
            )
          }
        >
          {rendering ? "Rendering" : "Render"}
        </Button>

        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            disabled={working || (!outputUrl && !metadata)}
            aria-expanded={exporting}
            title={
              outputUrl || metadata
                ? undefined
                : "Render the video or write its metadata first"
            }
            onClick={() => setExporting((open) => !open)}
          >
            Export
          </Button>

          {exporting ? (
            <div
              className={cn(
                "absolute right-0 z-10 mt-1 flex w-52 flex-col rounded-lg border",
                "border-border-subtle bg-surface p-1 shadow-lg",
              )}
            >
              {outputUrl ? (
                <a
                  href={outputUrl}
                  download={`${project.title}.mp4`}
                  onClick={() => setExporting(false)}
                  className="rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-surface-muted"
                >
                  Download MP4
                </a>
              ) : null}

              {metadata ? (
                <>
                  <ExportItem
                    label="Copy title"
                    onSelect={() => copy("title", metadata.content.title)}
                  />
                  <ExportItem
                    label="Copy description"
                    onSelect={() => copy("description", metadata.content.description)}
                  />
                  <ExportItem
                    label="Copy tags + hashtags"
                    onSelect={() =>
                      copy(
                        "tags",
                        [
                          metadata.content.tags.join(", "),
                          metadata.content.hashtags.join(" "),
                        ]
                          .filter(Boolean)
                          .join("\n"),
                      )
                    }
                  />
                </>
              ) : null}
            </div>
          ) : null}
        </div>

        <Button
          variant="ghost"
          size="sm"
          loading={busy === "publishing"}
          disabled={working || !project.hasRenderOutput}
          title={
            project.hasRenderOutput
              ? undefined
              : "Render the video before marking it published"
          }
          aria-expanded={publishUrl !== null}
          onClick={() => {
            if (project.publishedAt) {
              void run(
                "publishing",
                () => api.projects.setPublished(project.id, false),
                "Could not update this project.",
              );
              return;
            }

            setConfirmingDelete(false);
            setPublishUrl((open) => (open === null ? project.youtubeUrl ?? "" : null));
          }}
        >
          {project.publishedAt ? "Unpublish" : "Mark published"}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          loading={busy === "deleting"}
          disabled={working}
          className="text-danger hover:text-danger"
          aria-expanded={confirmingDelete}
          onClick={() => {
            setPublishUrl(null);
            setConfirmingDelete((open) => !open);
          }}
        >
          Delete
        </Button>
      </div>

      {publishUrl !== null ? (
        <form
          className="flex flex-wrap items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            const url = publishUrl.trim();
            setPublishUrl(null);
            void run(
              "publishing",
              () => api.projects.setPublished(project.id, true, url),
              "Could not update this project.",
            );
          }}
        >
          <Input
            type="url"
            value={publishUrl}
            autoFocus
            onChange={(event) => setPublishUrl(event.target.value)}
            placeholder="YouTube link (optional)"
            aria-label={`Where you published ${project.title}`}
            className="h-8 min-w-48 flex-1 text-sm"
          />
          <Button type="submit" size="sm">
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPublishUrl(null)}
          >
            Cancel
          </Button>
        </form>
      ) : null}

      {confirmingDelete ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="flex-1 text-sm text-foreground-muted">
            Its lesson, storyboard, audio, and renders go with it.
          </p>
          <Button
            variant="danger"
            size="sm"
            loading={busy === "deleting"}
            // The accessible name starts with the visible text so voice control
            // can still target the button by what the user sees.
            aria-label={`Delete permanently: ${project.title}`}
            onClick={() => {
              setConfirmingDelete(false);
              void run(
                "deleting",
                () => api.projects.remove(project.id),
                "Could not delete this project.",
              );
            }}
          >
            Delete permanently
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmingDelete(false)}
          >
            Cancel
          </Button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {copied ? (
        <p role="status" className="text-sm text-foreground-muted">
          Copied the {copied}.
        </p>
      ) : null}
    </div>
  );
}

function ExportItem({
  label,
  onSelect,
}: {
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="rounded px-2 py-1.5 text-left text-sm text-foreground hover:bg-surface-muted"
    >
      {label}
    </button>
  );
}
