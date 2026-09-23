"use client";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { EMPTY_QUIZ_QUESTION, EMPTY_SECTION } from "@/types/lesson";
import type { Lesson, LessonSection, QuizQuestion } from "@/types/lesson";

interface LessonEditorProps {
  lesson: Lesson;
  onChange: (lesson: Lesson) => void;
  disabled?: boolean;
  /** Field-keyed messages from the server, e.g. "sections.0.korean". */
  fieldErrors?: Record<string, string>;
}

/**
 * Editable form over a generated lesson. Edits are lifted to the parent so the
 * panel owns save state and the draft survives switching back to the view.
 */
export function LessonEditor({
  lesson,
  onChange,
  disabled,
  fieldErrors = {},
}: LessonEditorProps) {
  function patch(changes: Partial<Lesson>) {
    onChange({ ...lesson, ...changes });
  }

  function patchSection(index: number, changes: Partial<LessonSection>) {
    patch({
      sections: lesson.sections.map((section, i) =>
        i === index ? { ...section, ...changes } : section,
      ),
    });
  }

  function patchQuestion(index: number, changes: Partial<QuizQuestion>) {
    patch({
      quiz: lesson.quiz.map((question, i) =>
        i === index ? { ...question, ...changes } : question,
      ),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Field label="Title" required error={fieldErrors.title}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            invalid={invalid}
            value={lesson.title}
            onChange={(event) => patch({ title: event.target.value })}
            disabled={disabled}
          />
        )}
      </Field>

      <Field
        label="Hook"
        required
        hint="The first line spoken on camera."
        error={fieldErrors.hook}
      >
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            invalid={invalid}
            rows={2}
            value={lesson.hook}
            onChange={(event) => patch({ hook: event.target.value })}
            disabled={disabled}
          />
        )}
      </Field>

      <Field
        label="Learning objective"
        required
        error={fieldErrors.learning_objective}
      >
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            invalid={invalid}
            rows={2}
            value={lesson.learning_objective}
            onChange={(event) =>
              patch({ learning_objective: event.target.value })
            }
            disabled={disabled}
          />
        )}
      </Field>

      <section>
        <div className="mb-3 flex items-center justify-between gap-4">
          <h4 className="text-sm font-semibold text-foreground">
            Lesson content
          </h4>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => patch({ sections: [...lesson.sections, EMPTY_SECTION] })}
          >
            Add section
          </Button>
        </div>

        <div className="flex flex-col gap-4">
          {lesson.sections.map((section, index) => (
            <div
              key={index}
              className="rounded-lg border border-border-subtle p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground-muted">
                  Section {index + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled || lesson.sections.length === 1}
                  onClick={() =>
                    patch({
                      sections: lesson.sections.filter((_, i) => i !== index),
                    })
                  }
                >
                  Remove
                </Button>
              </div>

              <div className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Korean"
                    required
                    error={fieldErrors[`sections.${index}.korean`]}
                  >
                    {({ id, describedBy, invalid }) => (
                      <Input
                        id={id}
                        aria-describedby={describedBy}
                        invalid={invalid}
                        lang="ko"
                        value={section.korean}
                        onChange={(event) =>
                          patchSection(index, { korean: event.target.value })
                        }
                        disabled={disabled}
                      />
                    )}
                  </Field>

                  <Field
                    label="Romanization"
                    required
                    error={fieldErrors[`sections.${index}.romanization`]}
                  >
                    {({ id, describedBy, invalid }) => (
                      <Input
                        id={id}
                        aria-describedby={describedBy}
                        invalid={invalid}
                        value={section.romanization}
                        onChange={(event) =>
                          patchSection(index, {
                            romanization: event.target.value,
                          })
                        }
                        disabled={disabled}
                      />
                    )}
                  </Field>
                </div>

                <Field
                  label="Translation"
                  required
                  error={fieldErrors[`sections.${index}.translation`]}
                >
                  {({ id, describedBy, invalid }) => (
                    <Input
                      id={id}
                      aria-describedby={describedBy}
                      invalid={invalid}
                      value={section.translation}
                      onChange={(event) =>
                        patchSection(index, { translation: event.target.value })
                      }
                      disabled={disabled}
                    />
                  )}
                </Field>

                <Field
                  label="Explanation"
                  error={fieldErrors[`sections.${index}.explanation`]}
                >
                  {({ id, describedBy, invalid }) => (
                    <Textarea
                      id={id}
                      aria-describedby={describedBy}
                      invalid={invalid}
                      rows={2}
                      value={section.explanation}
                      onChange={(event) =>
                        patchSection(index, { explanation: event.target.value })
                      }
                      disabled={disabled}
                    />
                  )}
                </Field>

                <Field
                  label="Example sentence"
                  error={fieldErrors[`sections.${index}.example`]}
                >
                  {({ id, describedBy, invalid }) => (
                    <Input
                      id={id}
                      aria-describedby={describedBy}
                      invalid={invalid}
                      lang="ko"
                      value={section.example}
                      onChange={(event) =>
                        patchSection(index, { example: event.target.value })
                      }
                      disabled={disabled}
                    />
                  )}
                </Field>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-4">
          <h4 className="text-sm font-semibold text-foreground">Quiz</h4>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() =>
              patch({ quiz: [...lesson.quiz, structuredClone(EMPTY_QUIZ_QUESTION)] })
            }
          >
            Add question
          </Button>
        </div>

        <div className="flex flex-col gap-4">
          {lesson.quiz.map((question, index) => (
            <div
              key={index}
              className="rounded-lg border border-border-subtle p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground-muted">
                  Question {index + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() =>
                    patch({ quiz: lesson.quiz.filter((_, i) => i !== index) })
                  }
                >
                  Remove
                </Button>
              </div>

              <div className="flex flex-col gap-3">
                <Field
                  label="Question"
                  required
                  error={fieldErrors[`quiz.${index}.question`]}
                >
                  {({ id, describedBy, invalid }) => (
                    <Input
                      id={id}
                      aria-describedby={describedBy}
                      invalid={invalid}
                      value={question.question}
                      onChange={(event) =>
                        patchQuestion(index, { question: event.target.value })
                      }
                      disabled={disabled}
                    />
                  )}
                </Field>

                <QuizOptions
                  question={question}
                  disabled={disabled}
                  error={fieldErrors[`quiz.${index}.options`]}
                  onChange={(changes) => patchQuestion(index, changes)}
                />

                <Field
                  label="Correct answer"
                  required
                  hint="Chosen from the options above."
                  error={fieldErrors[`quiz.${index}.answer`]}
                >
                  {({ id, describedBy, invalid }) => (
                    <Select
                      id={id}
                      aria-describedby={describedBy}
                      invalid={invalid}
                      value={question.answer}
                      onChange={(event) =>
                        patchQuestion(index, { answer: event.target.value })
                      }
                      disabled={disabled}
                    >
                      <option value="">Select the correct option…</option>
                      {question.options.map((option, optionIndex) => (
                        <option key={optionIndex} value={option}>
                          {option || `(empty option ${optionIndex + 1})`}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function QuizOptions({
  question,
  disabled,
  error,
  onChange,
}: {
  question: QuizQuestion;
  disabled?: boolean;
  error?: string;
  onChange: (changes: Partial<QuizQuestion>) => void;
}) {
  function updateOption(index: number, value: string) {
    const options = question.options.map((option, i) =>
      i === index ? value : option,
    );
    onChange({
      options,
      // Keep the answer pointing at the same option after a rename.
      answer: question.answer === question.options[index] ? value : question.answer,
    });
  }

  function removeOption(index: number) {
    const removed = question.options[index];
    onChange({
      options: question.options.filter((_, i) => i !== index),
      answer: question.answer === removed ? "" : question.answer,
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">Options</span>

      {question.options.map((option, index) => (
        <div key={index} className="flex gap-2">
          <Input
            value={option}
            aria-label={`Option ${index + 1}`}
            onChange={(event) => updateOption(index, event.target.value)}
            disabled={disabled}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Remove option ${index + 1}`}
            disabled={disabled || question.options.length <= 2}
            onClick={() => removeOption(index)}
          >
            ✕
          </Button>
        </div>
      ))}

      <div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => onChange({ options: [...question.options, ""] })}
        >
          Add option
        </Button>
      </div>

      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
