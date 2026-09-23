import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { PreviewWorkspace } from "@/components/preview/preview-workspace";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { isAppError } from "@/server/errors";
import { getProject } from "@/server/services/project-service";
import type { VideoProject } from "@/types/project";

export async function generateMetadata({
  params,
}: PageProps<"/projects/[id]/preview">): Promise<Metadata> {
  const { id } = await params;
  const project = await findProject(id);
  return { title: project ? `Preview · ${project.title}` : "Project not found" };
}

export default async function PreviewPage({
  params,
}: PageProps<"/projects/[id]/preview">) {
  const { id } = await params;
  const project = await findProject(id);

  if (!project) {
    notFound();
  }

  const hasScenes = (project.scenes?.scenes.length ?? 0) > 0;

  return (
    <>
      <PageHeader
        title="Preview"
        description={project.title}
        actions={
          <ButtonLink href={`/projects/${project.id}`} variant="secondary">
            Back to project
          </ButtonLink>
        }
      />

      {hasScenes ? (
        <PreviewWorkspace project={project} />
      ) : (
        <EmptyState
          title="No storyboard to preview"
          description="Generate a lesson and then a storyboard, and the preview will play it back here."
          action={
            <ButtonLink href={`/projects/${project.id}`}>
              Go to the project
            </ButtonLink>
          }
        />
      )}
    </>
  );
}

/** Returns null for a missing project; anything else is a real failure. */
async function findProject(id: string): Promise<VideoProject | null> {
  try {
    return await getProject(id);
  } catch (error) {
    if (isAppError(error) && error.code === "not_found") {
      return null;
    }
    throw error;
  }
}
