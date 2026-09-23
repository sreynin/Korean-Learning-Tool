"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Field, FieldSet, Input, OptionGroup } from "@/components/ui/field";
import type { Option } from "@/components/ui/field";
import { ApiClientError, api } from "@/lib/api-client";
import {
  CONTENT_STYLE_META,
  FORMAT_META,
  LEVEL_META,
  LONG_DURATION_LABELS,
  SHORTS_DURATION_LABELS,
  TARGET_LANGUAGE_META,
  VISUAL_STYLE_META,
} from "@/lib/constants";
import {
  CONTENT_STYLES,
  LONG_DURATION_OPTIONS,
  PROFICIENCY_LEVELS,
  SHORTS_DURATION_OPTIONS,
  TARGET_LANGUAGES,
  VIDEO_FORMATS,
  VISUAL_STYLES,
  producesLongForm,
  producesShorts,
} from "@/types/project";
import type {
  ContentStyle,
  LongDuration,
  ProficiencyLevel,
  ShortsDuration,
  TargetLanguage,
  VideoFormat,
  VideoProject,
  VisualStyle,
} from "@/types/project";

const LEVEL_OPTIONS: Option<ProficiencyLevel>[] = PROFICIENCY_LEVELS.map(
  (level) => ({ value: level, label: LEVEL_META[level].label }),
);

const FORMAT_OPTIONS: Option<VideoFormat>[] = VIDEO_FORMATS.map((format) => ({
  value: format,
  label: FORMAT_META[format].label,
  description: FORMAT_META[format].description,
}));

const LANGUAGE_OPTIONS: Option<TargetLanguage>[] = TARGET_LANGUAGES.map(
  (language) => ({ value: language, label: TARGET_LANGUAGE_META[language].label }),
);

const CONTENT_STYLE_OPTIONS: Option<ContentStyle>[] = CONTENT_STYLES.map(
  (style) => ({ value: style, label: CONTENT_STYLE_META[style].label }),
);

const VISUAL_STYLE_OPTIONS: Option<VisualStyle>[] = VISUAL_STYLES.map(
  (style) => ({ value: style, label: VISUAL_STYLE_META[style].label }),
);

const SHORTS_OPTIONS: Option<ShortsDuration>[] = SHORTS_DURATION_OPTIONS.map(
  (seconds) => ({ value: seconds, label: SHORTS_DURATION_LABELS[seconds] }),
);

const LONG_OPTIONS: Option<LongDuration>[] = LONG_DURATION_OPTIONS.map(
  (seconds) => ({ value: seconds, label: LONG_DURATION_LABELS[seconds] }),
);

interface FormState {
  topic: string;
  level: ProficiencyLevel;
  format: VideoFormat;
  targetLanguage: TargetLanguage;
  contentStyle: ContentStyle | null;
  visualStyle: VisualStyle | null;
  shortsDurationSeconds: ShortsDuration;
  longDurationSeconds: LongDuration;
}

const INITIAL_STATE: FormState = {
  topic: "",
  level: "beginner",
  format: "shorts",
  targetLanguage: "korean",
  // Left unset deliberately: both materially change the output, so the
  // creator should pick rather than inherit a default.
  contentStyle: null,
  visualStyle: null,
  shortsDurationSeconds: 30,
  longDurationSeconds: 300,
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

export function CreateProjectForm({
  onCreated,
}: {
  onCreated: (project: VideoProject) => void;
}) {
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors = validate(form);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError("Please complete the highlighted fields.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const project = await api.projects.create({
        topic: form.topic,
        level: form.level,
        format: form.format,
        targetLanguage: form.targetLanguage,
        // validate() guarantees these are set by this point.
        contentStyle: form.contentStyle!,
        visualStyle: form.visualStyle!,
        ...(producesShorts(form.format)
          ? { shortsDurationSeconds: form.shortsDurationSeconds }
          : {}),
        ...(producesLongForm(form.format)
          ? { longDurationSeconds: form.longDurationSeconds }
          : {}),
      });

      onCreated(project);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setFieldErrors(error.fieldErrors as FieldErrors);
        setFormError(
          error.issues.length > 0
            ? "Please fix the highlighted fields."
            : error.message,
        );
      } else {
        setFormError("Could not create the project. Please try again.");
      }
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Alert tone="info" className="mb-6">
        Generating the lesson takes a moment. Assets, voice, captions, and
        rendering are not connected yet.
      </Alert>

      <Card>
        <CardContent className="flex flex-col gap-6">
          <Field
            label="Topic"
            required
            hint="What this video teaches."
            error={fieldErrors.topic}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                value={form.topic}
                onChange={(event) => update("topic", event.target.value)}
                placeholder="Korean Numbers 1-10"
                disabled={submitting}
              />
            )}
          </Field>

          <FieldSet
            legend="Learning level"
            required
            disabled={submitting}
            error={fieldErrors.level}
          >
            <OptionGroup
              name="level"
              value={form.level}
              onChange={(value) => update("level", value)}
              options={LEVEL_OPTIONS}
              disabled={submitting}
            />
          </FieldSet>

          <FieldSet
            legend="Video type"
            required
            disabled={submitting}
            error={fieldErrors.format}
          >
            <OptionGroup
              name="format"
              variant="card"
              value={form.format}
              onChange={(value) => update("format", value)}
              options={FORMAT_OPTIONS}
              disabled={submitting}
            />
          </FieldSet>

          <FieldSet
            legend="Target language"
            required
            hint="The language the lesson is explained in."
            disabled={submitting}
            error={fieldErrors.targetLanguage}
          >
            <OptionGroup
              name="targetLanguage"
              value={form.targetLanguage}
              onChange={(value) => update("targetLanguage", value)}
              options={LANGUAGE_OPTIONS}
              disabled={submitting}
            />
          </FieldSet>

          <FieldSet
            legend="Content style"
            required
            disabled={submitting}
            error={fieldErrors.contentStyle}
          >
            <OptionGroup
              name="contentStyle"
              value={form.contentStyle}
              onChange={(value) => update("contentStyle", value)}
              options={CONTENT_STYLE_OPTIONS}
              disabled={submitting}
            />
          </FieldSet>

          <FieldSet
            legend="Visual style"
            required
            disabled={submitting}
            error={fieldErrors.visualStyle}
          >
            <OptionGroup
              name="visualStyle"
              value={form.visualStyle}
              onChange={(value) => update("visualStyle", value)}
              options={VISUAL_STYLE_OPTIONS}
              disabled={submitting}
            />
          </FieldSet>

          {producesShorts(form.format) ? (
            <FieldSet
              legend="Short length"
              required
              disabled={submitting}
              error={fieldErrors.shortsDurationSeconds}
            >
              <OptionGroup
                name="shortsDurationSeconds"
                value={form.shortsDurationSeconds}
                onChange={(value) => update("shortsDurationSeconds", value)}
                options={SHORTS_OPTIONS}
                disabled={submitting}
              />
            </FieldSet>
          ) : null}

          {producesLongForm(form.format) ? (
            <FieldSet
              legend="Long video length"
              required
              disabled={submitting}
              error={fieldErrors.longDurationSeconds}
            >
              <OptionGroup
                name="longDurationSeconds"
                value={form.longDurationSeconds}
                onChange={(value) => update("longDurationSeconds", value)}
                options={LONG_OPTIONS}
                disabled={submitting}
              />
            </FieldSet>
          ) : null}

          {formError ? <Alert tone="danger">{formError}</Alert> : null}
        </CardContent>

        <CardFooter className="justify-end">
          <ButtonLink href="/projects" variant="secondary">
            Cancel
          </ButtonLink>
          <Button type="submit" loading={submitting}>
            Generate Lesson
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};

  if (form.topic.trim().length < 3) {
    errors.topic = "Enter a topic of at least 3 characters.";
  }
  if (!form.contentStyle) {
    errors.contentStyle = "Choose a content style.";
  }
  if (!form.visualStyle) {
    errors.visualStyle = "Choose a visual style.";
  }

  return errors;
}
