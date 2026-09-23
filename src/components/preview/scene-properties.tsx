"use client";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import {
  SCENE_ANIMATION_LABELS,
  SCENE_TRANSITION_LABELS,
  SCENE_TYPE_META,
} from "@/lib/constants";
import type { Scene } from "@/types/scene";

/**
 * Read-only view of the selected scene.
 *
 * Editing lives in the storyboard panel on the project page — duplicating that
 * form here would mean a second copy of its dirty-state and save handling.
 */
export function SceneProperties({
  scene,
  index,
  projectId,
}: {
  scene: Scene | null;
  index: number;
  projectId: string;
}) {
  if (!scene) {
    return (
      <p className="text-sm text-foreground-muted">No scene selected.</p>
    );
  }

  const meta = SCENE_TYPE_META[scene.type];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-foreground-muted">
          Scene {index + 1}
        </span>
        <Badge tone={meta.tone}>{meta.label}</Badge>
        <Badge>{scene.duration}s</Badge>
      </div>

      <Field label="Korean" value={scene.koreanText} lang="ko" />
      <Field label="Romanization" value={scene.romanization} italic />
      <Field label="English" value={scene.englishText} />
      <Field label="Narration" value={scene.narration} />
      <Field label="Visual prompt" value={scene.visualPrompt} />

      <dl className="flex flex-col gap-2 border-t border-border-subtle pt-3 text-sm">
        <Row label="Background" value={scene.background || "—"} />
        <Row label="Animation" value={SCENE_ANIMATION_LABELS[scene.animation]} />
        <Row
          label="Transition in"
          value={SCENE_TRANSITION_LABELS[scene.transition]}
        />
      </dl>

      <ButtonLink
        href={`/projects/${projectId}`}
        variant="secondary"
        size="sm"
        className="w-full"
      >
        Edit in storyboard
      </ButtonLink>
    </div>
  );
}

function Field({
  label,
  value,
  lang,
  italic,
}: {
  label: string;
  value: string;
  lang?: string;
  italic?: boolean;
}) {
  if (!value) return null;

  return (
    <div>
      <p className="text-xs font-semibold tracking-wide text-foreground-muted uppercase">
        {label}
      </p>
      <p
        lang={lang}
        className={`mt-0.5 text-sm text-foreground ${italic ? "italic" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-foreground-muted">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}
