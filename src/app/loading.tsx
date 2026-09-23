import { PageHeader } from "@/components/layout/page-header";
import { ProjectGridSkeleton, StatsGridSkeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your Korean-learning video production at a glance."
      />
      <StatsGridSkeleton />
      <div className="mt-8">
        <ProjectGridSkeleton count={3} />
      </div>
    </>
  );
}
