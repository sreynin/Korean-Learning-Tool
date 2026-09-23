import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { getMetadataGenerator } from "@/server/ai";
import { getProjectRepository } from "@/server/repositories";
import { getProject } from "@/server/services/project-service";
import { syncPipeline } from "@/server/services/pipeline-service";
import { TARGET_LANGUAGE_META } from "@/lib/constants";
import { metadataFor, metadataFormats } from "@/types/metadata";
import { producesShorts } from "@/types/project";
import type { MetadataPromptInput } from "@/server/ai/metadata-prompt";
import type {
  MetadataField,
  MetadataFormat,
  StoredMetadata,
  VideoMetadata,
} from "@/types/metadata";
import type { VideoProject } from "@/types/project";

/**
 * Writes the YouTube metadata for one cut of a project.
 *
 * The lesson is the input, so it has to exist first — metadata that does not
 * describe the actual lesson is the one thing the prompt forbids.
 */
export async function generateMetadataForProject(
  projectId: string,
  requestedFormat?: MetadataFormat,
): Promise<VideoProject> {
  const project = await getProject(projectId);
  const format = resolveMetadataFormat(project, requestedFormat);

  const { content, model } = await getMetadataGenerator().generate(
    promptInput(project, format),
  );

  return save(project, { format, content, model, edited: false });
}

/**
 * Rewrites one field, leaving the rest of the document alone.
 *
 * Regenerating a title should not cost the creator the description they were
 * happy with, so the other fields are passed to the model as context and
 * written back unchanged.
 */
export async function regenerateMetadataField(
  projectId: string,
  field: MetadataField,
  requestedFormat?: MetadataFormat,
): Promise<VideoProject> {
  const project = await getProject(projectId);
  const format = resolveMetadataFormat(project, requestedFormat);
  const existing = metadataFor(project.metadata, format);

  if (!existing) {
    throw new ConflictError(
      "Generate the metadata before regenerating one of its fields.",
    );
  }

  const { value, model } = await getMetadataGenerator().generateField(
    promptInput(project, format),
    field,
    existing.content,
  );

  return save(project, {
    format,
    content: { ...existing.content, [field]: value },
    model,
    // A single regenerated field is still a generation, not a hand edit, but
    // it keeps the document's original timestamp so the panel can go on
    // showing when the metadata was first written.
    edited: false,
    generatedAt: existing.generatedAt,
    editedAt: existing.editedAt,
  });
}

export async function saveMetadata(
  projectId: string,
  content: VideoMetadata,
  requestedFormat?: MetadataFormat,
): Promise<VideoProject> {
  const project = await getProject(projectId);
  const format = resolveMetadataFormat(project, requestedFormat);
  const existing = metadataFor(project.metadata, format);

  return save(project, {
    format,
    content,
    // The original model is preserved: a human edit does not make the text
    // some other model's output.
    model: existing?.model ?? "manual",
    edited: true,
    generatedAt: existing?.generatedAt,
  });
}

async function save(
  project: VideoProject,
  options: {
    format: MetadataFormat;
    content: VideoMetadata;
    model: string;
    edited: boolean;
    generatedAt?: string;
    editedAt?: string | null;
  },
): Promise<VideoProject> {
  const now = new Date().toISOString();

  const stored: StoredMetadata = {
    format: options.format,
    content: options.content,
    generatedAt: options.generatedAt ?? now,
    model: options.model,
    editedAt: options.edited ? now : (options.editedAt ?? null),
  };

  const updated = await getProjectRepository().update(project.id, {
    metadata: [
      ...project.metadata.filter((entry) => entry.format !== options.format),
      stored,
    ],
    status: project.status === "draft" ? "in_progress" : project.status,
    updatedAt: now,
  });

  if (!updated) {
    throw new NotFoundError(`No project found with id "${project.id}".`);
  }

  return syncPipeline(updated);
}

/**
 * Which cut the metadata is for. A project that produces one cut has no
 * choice to make; a `both` project defaults to its Short and is told when it
 * asks for a cut it does not produce.
 */
export function resolveMetadataFormat(
  project: VideoProject,
  requested?: MetadataFormat,
): MetadataFormat {
  const available = metadataFormats(project.format);

  if (!requested) return available[0];

  if (!available.includes(requested)) {
    throw new ValidationError(
      `This project does not produce a ${requested === "shorts" ? "Short" : "long-form video"}.`,
      [{ field: "format", message: "Not produced by this project's format." }],
    );
  }

  return requested;
}

function promptInput(
  project: VideoProject,
  format: MetadataFormat,
): MetadataPromptInput {
  if (!project.lesson) {
    throw new ConflictError(
      "Generate a lesson before writing metadata — the metadata describes it.",
    );
  }

  return {
    lesson: project.lesson.content,
    format,
    level: project.level,
    language: TARGET_LANGUAGE_META[project.targetLanguage].label,
    durationSeconds: durationFor(project, format),
  };
}

function durationFor(project: VideoProject, format: MetadataFormat): number {
  if (format === "shorts") return project.shortsDurationSeconds ?? 30;
  return project.longDurationSeconds ?? (producesShorts(project.format) ? 30 : 300);
}
