import { PageHeader } from "@/components/layout/page-header";
import { ProjectGridSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function ProjectsLoading() {
  return (
    <>
      <PageHeader
        title="Projects"
        description="Every Korean-learning video you have started."
      />
      <Skeleton className="mb-5 h-9 w-72" />
      <ProjectGridSkeleton />
    </>
  );
}
