import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { FORMAT_META, LEVEL_META, STATUS_META } from "@/lib/constants";
import { formatRelativeTime } from "@/lib/utils/format";
import {
  TOTAL_PIPELINE_STAGES,
  countCompletedStages,
  formatProjectDuration,
} from "@/lib/utils/project";
import type { VideoProject } from "@/types/project";

export function ProjectCard({ project }: { project: VideoProject }) {
  const format = FORMAT_META[project.format];
  const status = STATUS_META[project.status];
  const completedStages = countCompletedStages(project);

  return (
    <Card className="transition-colors hover:border-border-strong">
      <Link href={`/projects/${project.id}`} className="block p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={format.tone}>{format.shortLabel}</Badge>
          <Badge tone={status.tone}>{status.label}</Badge>
          <Badge>{LEVEL_META[project.level].label}</Badge>
        </div>

        <h3 className="mt-3 line-clamp-1 font-semibold text-foreground">
          {project.title}
        </h3>
        <p className="mt-1 line-clamp-2 min-h-10 text-sm text-foreground-muted">
          {project.description || project.topic}
        </p>

        <div className="mt-4">
          <Progress
            value={completedStages}
            max={TOTAL_PIPELINE_STAGES}
            label={`${project.title} production progress`}
          />
          <p className="mt-2 text-xs text-foreground-muted">
            {completedStages} of {TOTAL_PIPELINE_STAGES} steps complete
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-foreground-muted">
          <span>{formatProjectDuration(project)}</span>
          <span>Updated {formatRelativeTime(project.updatedAt)}</span>
        </div>
      </Link>
    </Card>
  );
}
