import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { LessonPanel } from "@/components/lesson/lesson-panel";
import { DeleteProjectButton } from "@/components/projects/delete-project-button";
import { PipelineList } from "@/components/projects/pipeline-list";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  CONTENT_STYLE_META,
  FORMAT_META,
  LEVEL_META,
  STATUS_META,
  TARGET_LANGUAGE_META,
  VISUAL_STYLE_META,
} from "@/lib/constants";
import { formatDate } from "@/lib/utils/format";
import {
  TOTAL_PIPELINE_STAGES,
  countCompletedStages,
  formatProjectDuration,
} from "@/lib/utils/project";
import { isAppError } from "@/server/errors";
import { getProject } from "@/server/services/project-service";
import type { VideoProject } from "@/types/project";

export async function generateMetadata({
  params,
}: PageProps<"/projects/[id]">): Promise<Metadata> {
  const { id } = await params;
  const project = await findProject(id);
  return { title: project?.title ?? "Project not found" };
}

export default async function ProjectEditorPage({
  params,
}: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const project = await findProject(id);

  if (!project) {
    notFound();
  }

  const format = FORMAT_META[project.format];
  const status = STATUS_META[project.status];
  const completedStages = countCompletedStages(project);

  return (
    <>
      <PageHeader
        title={project.title}
        description={project.topic}
        actions={
          <DeleteProjectButton
            projectId={project.id}
            projectTitle={project.title}
          />
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <Badge tone={format.tone}>{format.label}</Badge>
        <Badge tone={status.tone}>{status.label}</Badge>
        <Badge>{LEVEL_META[project.level].label}</Badge>
      </div>

      <Alert tone="info" className="mb-6">
        Lesson generation is available. Script, visuals, voice, captions, and
        export are not implemented yet.
      </Alert>

      <div className="mb-6">
        <LessonPanel project={project} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardContent>
            <div className="mb-4 flex items-center justify-between gap-4">
              <CardTitle>Production pipeline</CardTitle>
              <span className="text-sm text-foreground-muted">
                {completedStages} / {TOTAL_PIPELINE_STAGES}
              </span>
            </div>
            <Progress
              value={completedStages}
              max={TOTAL_PIPELINE_STAGES}
              label="Production progress"
              className="mb-4"
            />
            <PipelineList pipeline={project.pipeline} />
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardContent>
            <CardTitle>Details</CardTitle>
            <dl className="mt-4 flex flex-col gap-3 text-sm">
              <Detail label="Video type" value={format.label} />
              <Detail label="Level" value={LEVEL_META[project.level].label} />
              <Detail
                label="Target language"
                value={TARGET_LANGUAGE_META[project.targetLanguage].label}
              />
              <Detail
                label="Content style"
                value={CONTENT_STYLE_META[project.contentStyle].label}
              />
              <Detail
                label="Visual style"
                value={VISUAL_STYLE_META[project.visualStyle].label}
              />
              <Detail label="Length" value={formatProjectDuration(project)} />
              <Detail label="Created" value={formatDate(project.createdAt)} />
              <Detail label="Last updated" value={formatDate(project.updatedAt)} />
            </dl>

            {project.description ? (
              <div className="mt-5 border-t border-border-subtle pt-4">
                <dt className="text-sm font-medium text-foreground">Notes</dt>
                <dd className="mt-1 text-sm text-foreground-muted">
                  {project.description}
                </dd>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-foreground-muted">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
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
