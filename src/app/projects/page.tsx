import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ProjectFilters } from "@/components/projects/project-filters";
import { ProjectGrid } from "@/components/projects/project-grid";
import { listProjects } from "@/server/services/project-service";
import { projectListFiltersSchema } from "@/server/validation/project-schemas";
import type { ProjectListFilters } from "@/types/project";

export const metadata: Metadata = {
  title: "Projects",
};

export default async function ProjectsPage({
  searchParams,
}: PageProps<"/projects">) {
  const params = await searchParams;

  // Unknown or malformed query values are ignored rather than erroring —
  // a bad link should still render the library.
  const parsed = projectListFiltersSchema.safeParse({
    status: first(params.status),
    format: first(params.format),
    search: first(params.search),
  });
  const filters: ProjectListFilters = parsed.success ? parsed.data : {};

  const projects = await listProjects(filters);
  const isFiltered = Boolean(filters.status || filters.format || filters.search);

  return (
    <>
      <PageHeader
        title="Projects"
        description="Every Korean-learning video you have started."
      />

      <ProjectFilters filters={filters} />

      <ProjectGrid
        projects={projects}
        emptyTitle={isFiltered ? "No matching projects" : "No projects yet"}
        emptyDescription={
          isFiltered
            ? "Try a different filter or clear your search."
            : "Create your first Korean-learning video to get started."
        }
        showCreateAction={!isFiltered}
      />
    </>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.length > 0 ? raw : undefined;
}
