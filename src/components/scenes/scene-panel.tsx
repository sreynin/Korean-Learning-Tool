"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SceneCard } from "@/components/scenes/scene-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ApiClientError, api } from "@/lib/api-client";
import { cn } from "@/lib/utils/cn";
import { formatDuration, formatRelativeTime } from "@/lib/utils/format";
import { EMPTY_SCENE, totalSceneDuration } from "@/types/scene";
import type { Scene } from "@/types/scene";
import type { VideoProject } from "@/types/project";

const MOCK_MODEL_ID = "mock";

/** Tolerance before the total duration is flagged against the target. */
const DURATION_TOLERANCE_SECONDS = 2;

export function ScenePanel({
  project,
  targetDurationSeconds,
}: {
  project: VideoProject;
  targetDurationSeconds: number;
}) {
  const router = useRouter();

  const [stored, setStored] = useState(project.scenes);
  const [draft, setDraft] = useState<Scene[] | null>(null);
  const [busy, setBusy] = useState<"generating" | "saving" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const editing = draft !== null;
  const scenes = draft ?? stored?.scenes ?? [];
  const hasLesson = project.lesson !== null;

  const total = totalSceneDuration(scenes);
  const drift = total - targetDurationSeconds;
  const offTarget = Math.abs(drift) > DURATION_TOLERANCE_SECONDS;

  function patchScene(index: number, changes: Partial<Scene>) {
    setDraft((current) =>
      (current ?? []).map((scene, i) =>
        i === index ? { ...scene, ...changes } : scene,
      ),
    );
  }

  function move(from: number, to: number) {
    setDraft((current) => {
      if (!current || to < 0 || to >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function duplicate(index: number) {
    setDraft((current) => {
      if (!current) return current;
      // A fresh id keeps React keys unique; the server renumbers `order`.
      const copy: Scene = { ...current[index], id: crypto.randomUUID() };
      const next = [...current];
      next.splice(index + 1, 0, copy);
      return next;
    });
  }

  function addScene() {
    setDraft((current) => {
      const next = [...(current ?? [])];
      const scene: Scene = {
        ...EMPTY_SCENE,
        id: crypto.randomUUID(),
        order: next.length + 1,
        narration: "New scene narration.",
      };
      next.push(scene);
      setExpanded(scene.id);
      return next;
    });
  }

  async function handleGenerate() {
    setBusy("generating");
    setError(null);

    try {
      const updated = await api.scenes.generateForProject(project.id);
      setStored(updated.scenes);
      setDraft(null);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : "Scene generation failed. Please try again.",
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
      const updated = await api.scenes.save(project.id, draft);
      setStored(updated.scenes);
      setDraft(null);
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiClientError) {
        setFieldErrors(cause.fieldErrors);
        setError(
          cause.issues.length > 0
            ? "Please fix the highlighted scenes."
            : cause.message,
        );
      } else {
        setError("Could not save the storyboard. Please try again.");
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
            <CardTitle>Storyboard</CardTitle>
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
                  onClick={() => setDraft(structuredClone(stored.scenes))}
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
                <Button variant="secondary" disabled={busy !== null} onClick={addScene}>
                  Add scene
                </Button>
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
                  Save storyboard
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {stored?.model === MOCK_MODEL_ID ? (
          <Alert tone="warning" className="mt-4">
            This storyboard came from the mock generator. Its structure follows
            your lesson, but the narration and visual prompts are formulaic. Set{" "}
            <code>AI_API_KEY</code> and regenerate for real output.
          </Alert>
        ) : null}

        {error ? (
          <Alert tone="danger" className="mt-4">
            {error}
          </Alert>
        ) : null}

        {scenes.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-muted px-4 py-3 text-sm">
            <span className="text-foreground-muted">
              {scenes.length} scene{scenes.length === 1 ? "" : "s"}
            </span>
            <span
              className={cn(
                "font-medium",
                offTarget ? "text-warning" : "text-foreground",
              )}
            >
              {formatDuration(total)} / {formatDuration(targetDurationSeconds)}
              {offTarget
                ? ` · ${drift > 0 ? "+" : ""}${drift}s off target`
                : " · on target"}
            </span>
          </div>
        ) : null}

        <div className="mt-4">
          {scenes.length > 0 ? (
            <ol className="flex flex-col gap-2">
              {scenes.map((scene, index) => (
                <SceneCard
                  key={scene.id}
                  scene={scene}
                  index={index}
                  total={scenes.length}
                  expanded={expanded === scene.id}
                  disabled={!editing || busy !== null}
                  fieldErrors={fieldErrors}
                  dragging={dragIndex === index}
                  dropTarget={overIndex === index && dragIndex !== index}
                  onToggle={() =>
                    setExpanded((current) =>
                      current === scene.id ? null : scene.id,
                    )
                  }
                  onChange={(changes) => patchScene(index, changes)}
                  onMove={(direction) => move(index, index + direction)}
                  onDuplicate={() => duplicate(index)}
                  onDelete={() =>
                    setDraft(
                      (current) => current?.filter((_, i) => i !== index) ?? null,
                    )
                  }
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={() => setOverIndex(index)}
                  onDragEnd={() => {
                    if (dragIndex !== null && overIndex !== null) {
                      move(dragIndex, overIndex);
                    }
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                />
              ))}
            </ol>
          ) : hasLesson ? (
            <EmptyState
              title="No storyboard yet"
              description="Turn the saved lesson into an ordered list of timed scenes."
              action={
                <Button loading={busy === "generating"} onClick={handleGenerate}>
                  Generate scenes
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="Generate a lesson first"
              description="The storyboard is built from the lesson, so there is nothing to work from yet."
            />
          )}
        </div>

        {editing ? (
          <p className="mt-3 text-xs text-foreground-muted">
            Drag a scene by its handle to reorder, or use the arrow buttons.
            Changes are not saved until you choose Save storyboard.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
