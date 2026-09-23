import { ProjectSection } from "@/components/dashboard/project-section";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { PageHeader } from "@/components/layout/page-header";
import { getDashboardData } from "@/server/services/project-service";

// Stats and project lists must reflect the store on every request, so this
// page is never prerendered at build time.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { stats, recent, drafts, completed } = await getDashboardData();

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your Korean-learning video production at a glance."
      />

      <StatsGrid stats={stats} />

      <ProjectSection
        title="Recent projects"
        projects={recent}
        viewAllHref="/projects"
        emptyTitle="No projects yet"
        emptyDescription="Create your first Korean-learning video to see it here."
        showCreateAction
      />

      <ProjectSection
        title="Drafts"
        projects={drafts}
        viewAllHref="/projects?status=draft"
        emptyTitle="No drafts"
        emptyDescription="Projects you start but do not finish will appear here."
      />

      <ProjectSection
        title="Completed"
        projects={completed}
        viewAllHref="/projects?status=completed"
        emptyTitle="Nothing completed yet"
        emptyDescription="Finished videos ready for upload will appear here."
      />
    </>
  );
}
