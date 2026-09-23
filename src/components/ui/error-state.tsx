import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

interface ErrorStateProps {
  title?: string;
  message?: string;
  /** Shown in development only — useful while wiring up new features. */
  detail?: string;
  actions?: ReactNode;
}

export function ErrorState({
  title = "Something went wrong",
  message = "The page could not be loaded. Try again in a moment.",
  detail,
  actions,
}: ErrorStateProps) {
  return (
    <Card className="p-8 text-center">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-2 text-sm text-foreground-muted">{message}</p>

      {detail && process.env.NODE_ENV === "development" ? (
        <pre className="mt-4 overflow-x-auto rounded-lg bg-surface-muted p-3 text-left font-mono text-xs text-foreground-muted">
          {detail}
        </pre>
      ) : null}

      {actions ? (
        <div className="mt-6 flex justify-center gap-3">{actions}</div>
      ) : null}
    </Card>
  );
}
