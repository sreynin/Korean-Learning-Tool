import Link from "next/link";
import { ProjectGrid } from "@/components/projects/project-grid";
import type { VideoProject } from "@/types/project";

interface ProjectSectionProps {
  title: string;
  projects: VideoProject[];
  emptyTitle: string;
  emptyDescription?: string;
  viewAllHref?: string;
  showCreateAction?: boolean;
}

export function ProjectSection({
  title,
  projects,
  emptyTitle,
  emptyDescription,
  viewAllHref,
  showCreateAction,
}: ProjectSectionProps) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {viewAllHref && projects.length > 0 ? (
          <Link
            href={viewAllHref}
            className="text-sm font-medium text-brand hover:underline"
          >
            View all
          </Link>
        ) : null}
      </div>

      <ProjectGrid
        projects={projects}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        showCreateAction={showCreateAction}
      />
    </section>
  );
}
