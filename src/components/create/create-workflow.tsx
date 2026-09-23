"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CreateProjectForm } from "@/components/create/create-project-form";
import { GenerationProgress } from "@/components/create/generation-progress";
import type { VideoProject } from "@/types/project";

/**
 * Owns the two phases of the create flow: configuring the lesson, then the
 * generation progress view for the project that was just saved.
 */
export function CreateWorkflow() {
  const router = useRouter();
  const [project, setProject] = useState<VideoProject | null>(null);

  function handleCreated(created: VideoProject) {
    setProject(created);
    // The dashboard and library are server-rendered, so drop their cached
    // copies now that a project exists.
    router.refresh();
  }

  if (project) {
    return (
      <GenerationProgress
        project={project}
        onCreateAnother={() => setProject(null)}
      />
    );
  }

  return <CreateProjectForm onCreated={handleCreated} />;
}
