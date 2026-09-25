"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiClientError, api } from "@/lib/api-client";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import {
  CONTENT_STYLE_META,
  FORMAT_META,
  LEVEL_META,
  TARGET_LANGUAGE_META,
  VISUAL_STYLE_META,
} from "@/lib/constants";
import { cn } from "@/lib/utils/cn";
import { formatProjectDuration } from "@/lib/utils/project";
import type { VideoProject } from "@/types/project";

interface GenerationStep {
  label: string;
  /** Why this step cannot run yet. Absent for steps that actually run. */
  blockedReason?: string;
}

const GENERATION_STEPS: GenerationStep[] = [
  { label: "Topic analyzed" },
  { label: "Lesson structure created" },
  { label: "Creating scenes", blockedReason: "Open the project to generate" },
  { label: "Generating assets", blockedReason: "Needs the storyboard" },
  { label: "Preparing video", blockedReason: "Needs assets, voice, and captions" },
];

/**
 * Steps that actually run: the project was saved, then the lesson is generated
 * for real. Everything after step 2 is unimplemented and stays pending rather
 * than pretending to finish.
 */
const LIVE_STEP_COUNT = 2;

type StepStatus = "complete" | "running" | "pending" | "failed";

export function GenerationProgress({
  project,
  onCreateAnother,
}: {
  project: VideoProject;
  onCreateAnother: () => void;
}) {
  const router = useRouter();
  const [completed, setCompleted] = useState(1); // the project itself is saved
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const finished = completed >= LIVE_STEP_COUNT;

  useEffect(() => {
    if (finished) return;

    let cancelled = false;

    api.lessons
      .generateForProject(project.id)
      .then(() => {
        if (cancelled) return;
        setCompleted(LIVE_STEP_COUNT);
        router.refresh();
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof ApiClientError
            ? cause.message
            : "Lesson generation failed. Please try again.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [project.id, finished, attempt, router]);

  return (
    <Card>
      <CardContent>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{project.topic}</CardTitle>
            <p className="mt-1 text-sm text-foreground-muted">
              {finished ? "Setup complete" : "Setting up your lesson…"}
            </p>
          </div>
          <span className="text-sm text-foreground-muted">
            {completed} / {GENERATION_STEPS.length}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone={FORMAT_META[project.format].tone}>
            {FORMAT_META[project.format].label}
          </Badge>
          <Badge>{LEVEL_META[project.level].label}</Badge>
          <Badge>{TARGET_LANGUAGE_META[project.targetLanguage].label}</Badge>
          <Badge>{CONTENT_STYLE_META[project.contentStyle].label}</Badge>
          <Badge>{VISUAL_STYLE_META[project.visualStyle].label}</Badge>
          <Badge>{formatProjectDuration(project)}</Badge>
        </div>

        <Progress
          value={completed}
          max={GENERATION_STEPS.length}
          label="Lesson generation progress"
          className="mt-5"
        />

        <ol className="mt-5">
          {GENERATION_STEPS.map((step, index) => (
            <StepRow
              key={step.label}
              step={step}
              status={statusFor(index, completed, error)}
            />
          ))}
        </ol>

        {error ? (
          <Alert tone="danger" className="mt-5">
            {error}
          </Alert>
        ) : null}

        {finished ? (
          <Alert tone="info" className="mt-5">
            The lesson is ready to review and edit. Open the project to build
            its storyboard, then voice, caption, render, and publish it.
          </Alert>
        ) : null}
      </CardContent>

      <CardFooter className="justify-end">
        {error ? (
          <Button
            variant="secondary"
            onClick={() => {
              setError(null);
              setAttempt((n) => n + 1);
            }}
          >
            Retry
          </Button>
        ) : null}

        <Button variant="secondary" onClick={onCreateAnother} disabled={!finished}>
          Create another
        </Button>
        <ButtonLink
          href={`/projects/${project.id}`}
          className={cn(!finished && !error && "pointer-events-none opacity-50")}
          aria-disabled={!finished && !error ? true : undefined}
          tabIndex={finished || error ? undefined : -1}
        >
          {finished ? "Review lesson" : "Open project"}
        </ButtonLink>
      </CardFooter>
    </Card>
  );
}

function statusFor(
  index: number,
  completed: number,
  error: string | null,
): StepStatus {
  if (index < completed) return "complete";
  if (index === completed && completed < LIVE_STEP_COUNT) {
    return error ? "failed" : "running";
  }
  return "pending";
}

function StepRow({ step, status }: { step: GenerationStep; status: StepStatus }) {
  return (
    <li className="flex items-start gap-3 border-t border-border-subtle py-3 first:border-t-0">
      <StepIcon status={status} />
      <div className="min-w-0">
        <p
          className={cn(
            "text-sm",
            status === "pending"
              ? "text-foreground-muted"
              : "font-medium text-foreground",
          )}
        >
          {step.label}
        </p>
        {status === "pending" && step.blockedReason ? (
          <p className="text-xs text-foreground-muted">{step.blockedReason}</p>
        ) : null}
      </div>
    </li>
  );
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "running") {
    return <Spinner size="sm" className="mt-0.5 text-brand" label="In progress" />;
  }

  if (status === "failed") {
    return (
      <span
        aria-hidden="true"
        className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-danger text-[10px] font-bold text-surface"
      >
        !
      </span>
    );
  }

  if (status === "complete") {
    return (
      <span
        aria-hidden="true"
        className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-success text-[10px] font-bold text-surface"
      >
        ✓
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="mt-0.5 size-4 shrink-0 rounded-full border-2 border-border-strong"
    />
  );
}
