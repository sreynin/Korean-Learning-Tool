"use client";

import { useId } from "react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

const CONTROL_CLASSES =
  "w-full rounded-lg border bg-surface px-3 py-2 text-sm text-foreground " +
  "placeholder:text-foreground-muted transition-colors " +
  "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70";

function controlClasses(hasError: boolean, className?: string): string {
  return cn(
    CONTROL_CLASSES,
    hasError ? "border-danger" : "border-border-subtle hover:border-border-strong",
    className,
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Receives the ids to wire up `id`, `aria-describedby`, `aria-invalid`. */
  children: (ids: {
    id: string;
    describedBy: string | undefined;
    invalid: boolean;
  }) => ReactNode;
}

/**
 * Wraps a single form control with its label, hint, and error message, and
 * generates the ids needed to associate them for screen readers.
 */
export function Field({ label, hint, error, required, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {required ? <RequiredMark /> : null}
      </label>

      {children({ id, describedBy, invalid: Boolean(error) })}

      <FieldMessages hint={hint} hintId={hintId} error={error} errorId={errorId} />
    </div>
  );
}

interface FieldSetProps {
  legend: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  children: ReactNode;
}

/**
 * Grouped-control equivalent of `Field`. A group of radios needs a fieldset and
 * legend rather than a label, which can only point at one input.
 */
export function FieldSet({
  legend,
  hint,
  error,
  required,
  disabled,
  children,
}: FieldSetProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <fieldset disabled={disabled} className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium text-foreground">
        {legend}
        {required ? <RequiredMark /> : null}
      </legend>

      {children}

      <FieldMessages hint={hint} hintId={hintId} error={error} errorId={errorId} />
    </fieldset>
  );
}

function RequiredMark() {
  return (
    <span className="ml-0.5 text-danger" aria-hidden="true">
      *
    </span>
  );
}

function FieldMessages({
  hint,
  hintId,
  error,
  errorId,
}: {
  hint?: string;
  hintId: string;
  error?: string;
  errorId: string;
}) {
  return (
    <>
      {hint && !error ? (
        <p id={hintId} className="text-xs text-foreground-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </>
  );
}

interface ControlProps {
  invalid?: boolean;
}

export function Input({
  invalid,
  className,
  ...props
}: ComponentProps<"input"> & ControlProps) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      className={controlClasses(Boolean(invalid), className)}
    />
  );
}

export function Textarea({
  invalid,
  className,
  ...props
}: ComponentProps<"textarea"> & ControlProps) {
  return (
    <textarea
      {...props}
      aria-invalid={invalid || undefined}
      className={controlClasses(Boolean(invalid), cn("resize-y", className))}
    />
  );
}

export function Select({
  invalid,
  className,
  ...props
}: ComponentProps<"select"> & ControlProps) {
  return (
    <select
      {...props}
      aria-invalid={invalid || undefined}
      className={controlClasses(Boolean(invalid), cn("cursor-pointer", className))}
    />
  );
}

export interface Option<T extends string | number> {
  value: T;
  label: string;
  /** Only rendered by the "card" variant. */
  description?: string;
}

interface OptionGroupProps<T extends string | number> {
  name: string;
  value: T | null;
  onChange: (value: T) => void;
  options: readonly Option<T>[];
  /** "chip" for compact lists, "card" when each choice needs explaining. */
  variant?: "chip" | "card";
  disabled?: boolean;
}

/**
 * Single-choice selector backed by real radio inputs, so keyboard navigation
 * and screen-reader grouping work without custom key handling. Wrap it in a
 * `FieldSet` to give the group its legend.
 */
export function OptionGroup<T extends string | number>({
  name,
  value,
  onChange,
  options,
  variant = "chip",
  disabled,
}: OptionGroupProps<T>) {
  return (
    <div
      className={cn(
        variant === "card"
          ? "grid gap-3 sm:grid-cols-2"
          : "flex flex-wrap gap-2",
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <label
            key={option.value}
            className={cn(
              variant === "card" ? "block" : "inline-flex",
              disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              disabled={disabled}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />

            {variant === "card" ? (
              <span
                className={cn(
                  "flex h-full flex-col gap-1 rounded-lg border p-4 transition-colors",
                  "peer-focus-visible:ring-2 peer-focus-visible:ring-brand",
                  selected
                    ? "border-brand bg-brand-soft"
                    : "border-border-subtle bg-surface hover:border-border-strong",
                )}
              >
                <span className="text-sm font-medium text-foreground">
                  {option.label}
                </span>
                {option.description ? (
                  <span className="text-xs text-foreground-muted">
                    {option.description}
                  </span>
                ) : null}
              </span>
            ) : (
              <span
                className={cn(
                  "inline-flex rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                  "peer-focus-visible:ring-2 peer-focus-visible:ring-brand",
                  selected
                    ? "border-brand bg-brand text-brand-foreground"
                    : "border-border-subtle bg-surface text-foreground-muted hover:border-border-strong hover:text-foreground",
                )}
              >
                {option.label}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}
