"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Textarea } from "@/components/ui/field";
import { ApiClientError, api } from "@/lib/api-client";
import { cn } from "@/lib/utils/cn";
import { formatRelativeTime } from "@/lib/utils/format";
import {
  MAX_HASHTAGS,
  METADATA_FIELDS,
  METADATA_LIMITS,
  metadataFor,
  metadataFormats,
  tagsLength,
} from "@/types/metadata";
import type {
  MetadataField,
  MetadataFormat,
  VideoMetadata,
} from "@/types/metadata";
import type { VideoProject } from "@/types/project";

const MOCK_MODEL_ID = "mock";

const FIELD_LABELS: Record<MetadataField, string> = {
  title: "Title",
  description: "Description",
  hashtags: "Hashtags",
  tags: "Tags",
  thumbnailText: "Thumbnail text",
  pinnedComment: "Pinned comment",
};

const FIELD_HINTS: Record<MetadataField, string> = {
  title: "Shown in search and on the watch page.",
  description: "The first two lines show above the fold.",
  hashtags: "One per line, or separated by spaces. The first three show above the title.",
  tags: "One per line, or separated by commas. Not visible to viewers.",
  thumbnailText: "Two or three words, large enough to read on a phone.",
  pinnedComment: "Pin this under the video yourself after uploading.",
};

const FORMAT_LABELS: Record<MetadataFormat, string> = {
  shorts: "Short",
  long: "Long-form",
};

export function MetadataPanel({ project }: { project: VideoProject }) {
  const router = useRouter();

  const formats = metadataFormats(project.format);
  const [format, setFormat] = useState<MetadataFormat>(formats[0]);
  const [metadata, setMetadata] = useState(project.metadata);
  const [draft, setDraft] = useState<VideoMetadata | null>(null);
  const [busy, setBusy] = useState<"generating" | "saving" | MetadataField | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const stored = metadataFor(metadata, format);
  const content = draft ?? stored?.content ?? null;
  const dirty = draft !== null;
  const hasLesson = project.lesson !== null;

  function apply(updated: VideoProject, message: string | null) {
    setMetadata(updated.metadata);
    setDraft(null);
    setFieldErrors({});
    setNotice(message);
    router.refresh();
  }

  function fail(cause: unknown, fallback: string) {
    if (cause instanceof ApiClientError) {
      setFieldErrors(cause.fieldErrors);
      setError(
        cause.issues.length > 0 ? "Please fix the highlighted fields." : cause.message,
      );
    } else {
      setError(fallback);
    }
  }

  async function generate() {
    setBusy("generating");
    setError(null);
    setNotice(null);

    try {
      apply(await api.metadata.generate(project.id, format), null);
    } catch (cause) {
      fail(cause, "Could not write the metadata. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function regenerate(field: MetadataField) {
    setBusy(field);
    setError(null);
    setNotice(null);

    try {
      // Unsaved edits to other fields would be lost, so they are saved first.
      if (draft) await api.metadata.save(project.id, draft, format);

      apply(
        await api.metadata.regenerateField(project.id, field, format),
        `${FIELD_LABELS[field]} rewritten.`,
      );
    } catch (cause) {
      fail(cause, `Could not rewrite the ${FIELD_LABELS[field].toLowerCase()}.`);
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!draft) return;

    setBusy("saving");
    setError(null);
    setNotice(null);

    try {
      apply(await api.metadata.save(project.id, draft, format), "Metadata saved.");
    } catch (cause) {
      fail(cause, "Could not save the metadata. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  function edit(changes: Partial<VideoMetadata>) {
    if (!content) return;
    setDraft({ ...content, ...changes });
    setNotice(null);
  }

  const working = busy !== null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>YouTube metadata</CardTitle>
            {stored ? (
              <p className="mt-1 text-sm text-foreground-muted">
                {stored.editedAt
                  ? `Edited ${formatRelativeTime(stored.editedAt)}`
                  : `Generated ${formatRelativeTime(stored.generatedAt)}`}
                {" · "}
                {stored.model}
              </p>
            ) : (
              <p className="mt-1 text-sm text-foreground-muted">
                Title, description, hashtags, tags, thumbnail text, and a pinned
                comment — written from this project&apos;s lesson.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {dirty ? (
              <>
                <Button
                  variant="ghost"
                  disabled={working}
                  onClick={() => {
                    setDraft(null);
                    setFieldErrors({});
                    setError(null);
                  }}
                >
                  Discard
                </Button>
                <Button loading={busy === "saving"} disabled={working} onClick={save}>
                  Save
                </Button>
              </>
            ) : null}

            {stored && !dirty ? (
              <Button
                variant="secondary"
                loading={busy === "generating"}
                disabled={working}
                onClick={generate}
              >
                Regenerate all
              </Button>
            ) : null}
          </div>
        </div>

        {formats.length > 1 ? (
          <div className="flex gap-2" role="tablist" aria-label="Video cut">
            {formats.map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={value === format}
                disabled={working || dirty}
                onClick={() => {
                  setFormat(value);
                  setError(null);
                  setNotice(null);
                }}
                className={cn(
                  "h-8 rounded-lg px-3 text-sm font-medium transition-colors disabled:opacity-50",
                  value === format
                    ? "bg-brand text-brand-foreground"
                    : "bg-surface-muted text-foreground-muted hover:text-foreground",
                )}
              >
                {FORMAT_LABELS[value]}
                {metadataFor(metadata, value) ? null : " · not written"}
              </button>
            ))}
          </div>
        ) : null}

        {error ? <Alert tone="danger">{error}</Alert> : null}
        {notice ? <Alert tone="success">{notice}</Alert> : null}

        {stored?.model === MOCK_MODEL_ID ? (
          <Alert tone="warning">
            This metadata came from the mock generator. Set AI_API_KEY in
            .env.local and regenerate before publishing any of it.
          </Alert>
        ) : null}

        {!content ? (
          <EmptyState
            title={`No metadata for the ${FORMAT_LABELS[format].toLowerCase()} cut yet`}
            description={
              hasLesson
                ? "Write the title, description, hashtags, tags, thumbnail text, and pinned comment from this project's lesson."
                : "Generate a lesson first — the metadata describes what the video actually teaches."
            }
            action={
              hasLesson ? (
                <Button loading={busy === "generating"} onClick={generate}>
                  Write metadata
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="flex flex-col gap-5">
            {METADATA_FIELDS.map((field) => (
              <MetadataFieldRow
                key={field}
                field={field}
                content={content}
                error={fieldErrors[field]}
                busy={busy === field}
                disabled={working}
                onEdit={edit}
                onRegenerate={() => regenerate(field)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetadataFieldRow({
  field,
  content,
  error,
  busy,
  disabled,
  onEdit,
  onRegenerate,
}: {
  field: MetadataField;
  content: VideoMetadata;
  error?: string;
  busy: boolean;
  disabled: boolean;
  onEdit: (changes: Partial<VideoMetadata>) => void;
  onRegenerate: () => void;
}) {
  const value = content[field];
  const list = Array.isArray(value);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label
          htmlFor={`metadata-${field}`}
          className="text-sm font-medium text-foreground"
        >
          {FIELD_LABELS[field]}
        </label>

        <div className="flex items-center gap-3">
          <Counter field={field} content={content} />
          <Button
            variant="ghost"
            size="sm"
            loading={busy}
            disabled={disabled}
            onClick={onRegenerate}
          >
            Regenerate
          </Button>
        </div>
      </div>

      {list ? (
        <Textarea
          id={`metadata-${field}`}
          rows={field === "tags" ? 3 : 2}
          value={(value as string[]).join("\n")}
          invalid={Boolean(error)}
          disabled={disabled}
          onChange={(event) =>
            onEdit({ [field]: parseList(field, event.target.value) })
          }
        />
      ) : field === "description" || field === "pinnedComment" ? (
        <Textarea
          id={`metadata-${field}`}
          rows={field === "description" ? 10 : 4}
          value={value as string}
          invalid={Boolean(error)}
          disabled={disabled}
          onChange={(event) => onEdit({ [field]: event.target.value })}
        />
      ) : (
        <Input
          id={`metadata-${field}`}
          value={value as string}
          invalid={Boolean(error)}
          disabled={disabled}
          onChange={(event) => onEdit({ [field]: event.target.value })}
        />
      )}

      <p className={cn("text-sm", error ? "text-danger" : "text-foreground-muted")}>
        {error ?? FIELD_HINTS[field]}
      </p>
    </div>
  );
}

/** Characters used against the field's limit, or how many entries a list has. */
function Counter({
  field,
  content,
}: {
  field: MetadataField;
  content: VideoMetadata;
}) {
  if (field === "hashtags") {
    return <Used used={content.hashtags.length} limit={MAX_HASHTAGS} unit="tags" />;
  }

  if (field === "tags") {
    return (
      <Used
        used={tagsLength(content.tags)}
        limit={METADATA_LIMITS.tagsTotal}
        unit="chars"
      />
    );
  }

  const limit = METADATA_LIMITS[field];
  return <Used used={(content[field] as string).length} limit={limit} unit="chars" />;
}

function Used({
  used,
  limit,
  unit,
}: {
  used: number;
  limit: number;
  unit: string;
}) {
  return (
    <span
      className={cn(
        "text-sm tabular-nums",
        used > limit ? "text-danger" : "text-foreground-muted",
      )}
    >
      {used}/{limit} {unit}
    </span>
  );
}

/**
 * Hashtags and tags are edited as text. Both accept one per line; hashtags also
 * split on spaces and tags on commas, because that is how they are pasted.
 */
function parseList(field: MetadataField, raw: string): string[] {
  const separator = field === "hashtags" ? /[\s]+/ : /[\n,]+/;

  return raw
    .split(separator)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
