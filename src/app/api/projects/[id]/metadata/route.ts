import { z } from "zod";
import { jsonOk, parseJsonBody, route } from "@/server/http";
import { GENERATION_LIMIT, enforceRateLimit } from "@/server/rate-limit";
import { metadataEditSchema } from "@/server/ai/metadata-schema";
import {
  generateMetadataForProject,
  saveMetadata,
} from "@/server/services/metadata-service";
import { RENDER_FORMATS } from "@/types/render";

/** Metadata is a handful of short fields, so generation is quick. */
export const maxDuration = 120;

interface RouteContext {
  params: Promise<{ id: string }>;
}

const generateSchema = z.object({
  format: z.enum(RENDER_FORMATS).optional(),
});

const saveSchema = metadataEditSchema.extend({
  format: z.enum(RENDER_FORMATS).optional(),
});

/** Writes the metadata for one cut from the project's saved lesson. */
export const POST = route(async (request: Request, context: RouteContext) => {
  enforceRateLimit("metadata", GENERATION_LIMIT);

  const { id } = await context.params;
  const { format } = await parseOptionalBody(request);

  return jsonOk(await generateMetadataForProject(id, format));
});

/** Saves edited metadata for one cut. */
export const PUT = route(async (request: Request, context: RouteContext) => {
  const { id } = await context.params;
  const { format, ...content } = await parseJsonBody(request, saveSchema);

  return jsonOk(await saveMetadata(id, content, format));
});

async function parseOptionalBody(request: Request) {
  const raw = await request.clone().text();
  if (!raw.trim()) return {};

  return parseJsonBody(request, generateSchema);
}
