import { z } from "zod";
import { ValidationError } from "@/server/errors";
import { jsonOk, parseJsonBody, route } from "@/server/http";
import { FIELD_LIMIT, enforceRateLimit } from "@/server/rate-limit";
import { regenerateMetadataField } from "@/server/services/metadata-service";
import { METADATA_FIELDS } from "@/types/metadata";
import { RENDER_FORMATS } from "@/types/render";
import type { MetadataField } from "@/types/metadata";

export const maxDuration = 120;

interface RouteContext {
  params: Promise<{ id: string; field: string }>;
}

const bodySchema = z.object({ format: z.enum(RENDER_FORMATS).optional() });

/** Rewrites one field, leaving the rest of the document as it is. */
export const POST = route(async (request: Request, context: RouteContext) => {
  enforceRateLimit("metadata-field", FIELD_LIMIT);

  const { id, field } = await context.params;
  const { format } = await parseOptionalBody(request);

  return jsonOk(await regenerateMetadataField(id, assertField(field), format));
});

function assertField(value: string): MetadataField {
  if (!METADATA_FIELDS.includes(value as MetadataField)) {
    throw new ValidationError(`"${value}" is not a metadata field.`, [
      { field: "field", message: `Expected one of: ${METADATA_FIELDS.join(", ")}.` },
    ]);
  }

  return value as MetadataField;
}

async function parseOptionalBody(request: Request) {
  const raw = await request.clone().text();
  if (!raw.trim()) return {};

  return parseJsonBody(request, bodySchema);
}
