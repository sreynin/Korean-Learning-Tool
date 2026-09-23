"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LessonEditor } from "@/components/lesson/lesson-editor";
import { LessonView } from "@/components/lesson/lesson-view";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ApiClientError, api } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/utils/format";
import type { Lesson } from "@/types/lesson";
import type { VideoProject } from "@/types/project";

const MOCK_MODEL_ID = "mock";

export function LessonPanel({ project }: { project: VideoProject }) {
  const router = useRouter();

  const [stored, setStored] = useState(project.lesson);
  const [draft, setDraft] = useState<Lesson | null>(null);
  const [busy, setBusy] = useState<"generating" | "saving" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const editing = draft !== null;

  async function handleGenerate() {
    setBusy("generating");
    setError(null);

    try {
      const updated = await api.lessons.generateForProject(project.id);
      setStored(updated.lesson);
      setDraft(null);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : "Lesson generation failed. Please try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleSave() {
    if (!draft) return;

    setBusy("saving");
    setError(null);
    setFieldErrors({});

    try {
      const updated = await api.lessons.save(project.id, draft);
      setStored(updated.lesson);
      setDraft(null);
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiClientError) {
        setFieldErrors(cause.fieldErrors);
        setError(
          cause.issues.length > 0
            ? "Please fix the highlighted fields."
            : cause.message,
        );
      } else {
        setError("Could not save the lesson. Please try again.");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardContent>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Lesson</CardTitle>
            {stored ? (
              <p className="mt-1 text-sm text-foreground-muted">
                {stored.editedAt
                  ? `Edited ${formatRelativeTime(stored.editedAt)}`
                  : `Generated ${formatRelativeTime(stored.generatedAt)}`}
                {" · "}
                {stored.model}
              </p>
            ) : null}
          </div>

          <div className="flex gap-2">
            {stored && !editing ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => setDraft(structuredClone(stored.content))}
                >
                  Edit
                </Button>
                <Button
                  variant="secondary"
                  loading={busy === "generating"}
                  onClick={handleGenerate}
                >
                  Regenerate
                </Button>
              </>
            ) : null}

            {editing ? (
              <>
                <Button
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={() => {
                    setDraft(null);
                    setError(null);
                    setFieldErrors({});
                  }}
                >
                  Cancel
                </Button>
                <Button loading={busy === "saving"} onClick={handleSave}>
                  Save lesson
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {stored?.model === MOCK_MODEL_ID ? (
          <Alert tone="warning" className="mt-4">
            This is placeholder content from the mock generator. Set{" "}
            <code>AI_API_KEY</code> in <code>.env.local</code> and regenerate to
            get a real lesson.
          </Alert>
        ) : null}

        {error ? (
          <Alert tone="danger" className="mt-4">
            {error}
          </Alert>
        ) : null}

        <div className="mt-5">
          {editing && draft ? (
            <LessonEditor
              lesson={draft}
              onChange={setDraft}
              disabled={busy !== null}
              fieldErrors={fieldErrors}
            />
          ) : stored ? (
            <LessonView lesson={stored.content} />
          ) : (
            <EmptyState
              title="No lesson yet"
              description="Generate a structured lesson from this project's topic, level, format, language, and content style."
              action={
                <Button loading={busy === "generating"} onClick={handleGenerate}>
                  Generate lesson
                </Button>
              }
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
