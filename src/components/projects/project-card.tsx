import Link from "next/link";
import { ProjectActions } from "@/components/projects/project-actions";
import { ProjectThumbnail } from "@/components/projects/project-thumbnail";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FORMAT_META, LEVEL_META, STATUS_META } from "@/lib/constants";
import { formatDate, formatRelativeTime } from "@/lib/utils/format";
import { formatProjectDuration } from "@/lib/utils/project";
import type { VideoProject } from "@/types/project";

export function ProjectCard({ project }: { project: VideoProject }) {
  const format = FORMAT_META[project.format];
  const status = STATUS_META[project.status];

  return (
    <Card className="flex flex-col transition-colors hover:border-border-strong">
      <Link
        href={`/projects/${project.id}`}
        className="flex flex-1 flex-col gap-3 p-4 pb-3"
      >
        <ProjectThumbnail project={project} />

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={status.tone}>{status.label}</Badge>
          <Badge tone={format.tone}>{format.shortLabel}</Badge>
          <Badge>{LEVEL_META[project.level].label}</Badge>
        </div>

        <div className="flex-1">
          <h3 className="line-clamp-1 font-semibold text-foreground">
            {project.title}
          </h3>
          <p className="mt-0.5 line-clamp-2 text-sm text-foreground-muted">
            {project.topic}
          </p>
        </div>

        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground-muted">
          <div className="flex gap-1">
            <dt className="sr-only">Length</dt>
            <dd>{formatProjectDuration(project)}</dd>
          </div>
          <div className="flex gap-1">
            <dt>Created</dt>
            <dd>
              <time dateTime={project.createdAt}>
                {formatDate(project.createdAt)}
              </time>
            </dd>
          </div>
          <div className="flex gap-1">
            <dt>Updated</dt>
            <dd>
              <time dateTime={project.updatedAt}>
                {formatRelativeTime(project.updatedAt)}
              </time>
            </dd>
          </div>
        </dl>
      </Link>

      <div className="border-t border-border-subtle px-4 py-3">
        <ProjectActions project={project} />
      </div>
    </Card>
  );
}
