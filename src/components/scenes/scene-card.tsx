"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  SCENE_ANIMATION_LABELS,
  SCENE_TRANSITION_LABELS,
  SCENE_TYPE_META,
} from "@/lib/constants";
import { cn } from "@/lib/utils/cn";
import { formatDuration } from "@/lib/utils/format";
import {
  MAX_SCENE_DURATION,
  MIN_SCENE_DURATION,
  SCENE_ANIMATIONS,
  SCENE_TRANSITIONS,
  SCENE_TYPES,
} from "@/types/scene";
import type {
  Scene,
  SceneAnimation,
  SceneTransition,
  SceneType,
} from "@/types/scene";

export interface SceneCardProps {
  scene: Scene;
  index: number;
  total: number;
  expanded: boolean;
  disabled?: boolean;
  /** Field-keyed messages from the server, e.g. "scenes.2.narration". */
  fieldErrors?: Record<string, string>;
  dragging?: boolean;
  dropTarget?: boolean;
  onToggle: () => void;
  onChange: (changes: Partial<Scene>) => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDragEnd: () => void;
}

export function SceneCard({
  scene,
  index,
  total,
  expanded,
  disabled,
  fieldErrors = {},
  dragging,
  dropTarget,
  onToggle,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
  onDragStart,
  onDragOver,
  onDragEnd,
}: SceneCardProps) {
  const meta = SCENE_TYPE_META[scene.type];
  const errorKey = (field: string) => fieldErrors[`scenes.${index}.${field}`];

  const hasError = Object.keys(fieldErrors).some((key) =>
    key.startsWith(`scenes.${index}.`),
  );

  return (
    <li
      draggable={!disabled}
      onDragStart={onDragStart}
      onDragOver={(event) => {
        event.preventDefault();
        onDragOver();
      }}
      onDragEnd={onDragEnd}
      onDrop={(event) => event.preventDefault()}
      className={cn(
        "rounded-lg border bg-surface transition-colors",
        hasError ? "border-danger" : "border-border-subtle",
        dragging && "opacity-40",
        dropTarget && "border-brand ring-2 ring-brand",
      )}
    >
      <div className="flex items-start gap-3 p-3">
        <span
          aria-hidden="true"
          title="Drag to reorder"
          className={cn(
            "mt-1 shrink-0 text-foreground-muted select-none",
            disabled ? "cursor-not-allowed" : "cursor-grab",
          )}
        >
          ⠿
        </span>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="min-w-0 flex-1 text-left"
        >
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-foreground-muted">
              {index + 1}
            </span>
            <Badge tone={meta.tone}>{meta.label}</Badge>
            <span className="text-xs text-foreground-muted">
              {formatDuration(scene.duration)}
            </span>
          </span>
          <span className="mt-1 block truncate text-sm text-foreground">
            {scene.koreanText || scene.englishText || scene.narration || "Empty scene"}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Move scene ${index + 1} up`}
            disabled={disabled || index === 0}
            onClick={() => onMove(-1)}
          >
            ↑
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Move scene ${index + 1} down`}
            disabled={disabled || index === total - 1}
            onClick={() => onMove(1)}
          >
            ↓
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Duplicate scene ${index + 1}`}
            disabled={disabled}
            onClick={onDuplicate}
          >
            Copy
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Delete scene ${index + 1}`}
            disabled={disabled || total === 1}
            onClick={onDelete}
          >
            ✕
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="flex flex-col gap-4 border-t border-border-subtle p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Scene type" error={errorKey("type")}>
              {({ id, describedBy, invalid }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={scene.type}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({ type: event.target.value as SceneType })
                  }
                >
                  {SCENE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {SCENE_TYPE_META[type].label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field
              label="Duration (seconds)"
              required
              error={errorKey("duration")}
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  type="number"
                  inputMode="numeric"
                  min={MIN_SCENE_DURATION}
                  max={MAX_SCENE_DURATION}
                  value={scene.duration}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({ duration: Number(event.target.value) })
                  }
                />
              )}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Korean text" error={errorKey("koreanText")}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  lang="ko"
                  value={scene.koreanText}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({ koreanText: event.target.value })
                  }
                />
              )}
            </Field>

            <Field label="Romanization" error={errorKey("romanization")}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={scene.romanization}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({ romanization: event.target.value })
                  }
                />
              )}
            </Field>
          </div>

          <Field label="English text" error={errorKey("englishText")}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                value={scene.englishText}
                disabled={disabled}
                onChange={(event) =>
                  onChange({ englishText: event.target.value })
                }
              />
            )}
          </Field>

          <Field
            label="Narration"
            required
            hint="What the voice-over says. On-screen text is separate."
            error={errorKey("narration")}
          >
            {({ id, describedBy, invalid }) => (
              <Textarea
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                rows={2}
                value={scene.narration}
                disabled={disabled}
                onChange={(event) => onChange({ narration: event.target.value })}
              />
            )}
          </Field>

          <Field
            label="Visual prompt"
            hint="Describes the image behind the text."
            error={errorKey("visualPrompt")}
          >
            {({ id, describedBy, invalid }) => (
              <Textarea
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                rows={2}
                value={scene.visualPrompt}
                disabled={disabled}
                onChange={(event) =>
                  onChange({ visualPrompt: event.target.value })
                }
              />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Background" error={errorKey("background")}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={scene.background}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({ background: event.target.value })
                  }
                />
              )}
            </Field>

            <Field label="Animation" error={errorKey("animation")}>
              {({ id, describedBy, invalid }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={scene.animation}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({ animation: event.target.value as SceneAnimation })
                  }
                >
                  {SCENE_ANIMATIONS.map((animation) => (
                    <option key={animation} value={animation}>
                      {SCENE_ANIMATION_LABELS[animation]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Transition in" error={errorKey("transition")}>
              {({ id, describedBy, invalid }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={scene.transition}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({
                      transition: event.target.value as SceneTransition,
                    })
                  }
                >
                  {SCENE_TRANSITIONS.map((transition) => (
                    <option key={transition} value={transition}>
                      {SCENE_TRANSITION_LABELS[transition]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </div>
      ) : null}
    </li>
  );
}
