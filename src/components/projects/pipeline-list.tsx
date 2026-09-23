import { Badge } from "@/components/ui/badge";
import { STAGE_META, STAGE_STATUS_META } from "@/lib/constants";
import { cn } from "@/lib/utils/cn";
import { PIPELINE_STAGES } from "@/types/project";
import type { ProjectPipeline } from "@/types/project";

/**
 * The production pipeline. Steps beyond "Topic" are rendered read-only until
 * their generation features are built.
 */
export function PipelineList({ pipeline }: { pipeline: ProjectPipeline }) {
  return (
    <ol className="flex flex-col">
      {PIPELINE_STAGES.map((stage, index) => {
        const meta = STAGE_META[stage];
        const state = pipeline[stage];
        const statusMeta = STAGE_STATUS_META[state.status];

        return (
          <li
            key={stage}
            className={cn(
              "flex items-start gap-4 py-3",
              index > 0 && "border-t border-border-subtle",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
                state.status === "complete"
                  ? "bg-brand text-brand-foreground"
                  : "bg-surface-muted text-foreground-muted",
              )}
            >
              {index + 1}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-foreground">{meta.label}</p>
                <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                {!meta.implemented ? <Badge>Coming soon</Badge> : null}
              </div>
              <p className="mt-0.5 text-sm text-foreground-muted">
                {meta.description}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
