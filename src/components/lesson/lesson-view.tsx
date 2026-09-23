import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import type { Lesson } from "@/types/lesson";

/** Read-only presentation of a generated lesson. */
export function LessonView({ lesson }: { lesson: Lesson }) {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="text-lg font-semibold text-foreground">{lesson.title}</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge tone="brand">{lesson.level}</Badge>
          <Badge>{lesson.language}</Badge>
        </div>
      </section>

      <Block label="Hook">
        <p className="text-sm text-foreground">{lesson.hook}</p>
      </Block>

      <Block label="Learning objective">
        <p className="text-sm text-foreground">{lesson.learning_objective}</p>
      </Block>

      <Block label={`Lesson content (${lesson.sections.length})`}>
        <ol className="flex flex-col gap-3">
          {lesson.sections.map((section, index) => (
            <li
              key={index}
              className="rounded-lg border border-border-subtle bg-surface-muted/40 p-4"
            >
              <div className="flex items-baseline gap-3">
                <span className="text-xs font-semibold text-foreground-muted">
                  {index + 1}
                </span>
                <p className="text-lg font-semibold text-foreground">
                  {section.korean}
                </p>
              </div>

              <p className="mt-0.5 pl-7 text-sm text-foreground-muted italic">
                {section.romanization}
              </p>
              <p className="mt-1 pl-7 text-sm font-medium text-foreground">
                {section.translation}
              </p>

              {section.explanation ? (
                <p className="mt-2 pl-7 text-sm text-foreground-muted">
                  {section.explanation}
                </p>
              ) : null}

              {section.example ? (
                <p className="mt-2 ml-7 border-l-2 border-brand pl-3 text-sm text-foreground">
                  {section.example}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </Block>

      {lesson.quiz.length > 0 ? (
        <Block label={`Quiz (${lesson.quiz.length})`}>
          <ol className="flex flex-col gap-3">
            {lesson.quiz.map((question, index) => (
              <li
                key={index}
                className="rounded-lg border border-border-subtle p-4"
              >
                <p className="text-sm font-medium text-foreground">
                  {index + 1}. {question.question}
                </p>
                <ul className="mt-2 flex flex-col gap-1">
                  {question.options.map((option, optionIndex) => {
                    const correct = option === question.answer;
                    return (
                      <li
                        key={optionIndex}
                        className={cn(
                          "flex items-center gap-2 text-sm",
                          correct
                            ? "font-medium text-success"
                            : "text-foreground-muted",
                        )}
                      >
                        <span aria-hidden="true">{correct ? "✓" : "○"}</span>
                        <span>{option}</span>
                        {correct ? (
                          <span className="sr-only">(correct answer)</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
        </Block>
      ) : null}
    </div>
  );
}

function Block({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold tracking-wide text-foreground-muted uppercase">
        {label}
      </h4>
      {children}
    </section>
  );
}
