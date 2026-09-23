import { ProjectCard } from "@/components/projects/project-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { VideoProject } from "@/types/project";

interface ProjectGridProps {
  projects: VideoProject[];
  emptyTitle: string;
  emptyDescription?: string;
  /** Shows a "Create New Video" action in the empty state. */
  showCreateAction?: boolean;
}

export function ProjectGrid({
  projects,
  emptyTitle,
  emptyDescription,
  showCreateAction = false,
}: ProjectGridProps) {
  if (projects.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={
          showCreateAction ? (
            <ButtonLink href="/create">Create New Video</ButtonLink>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}
