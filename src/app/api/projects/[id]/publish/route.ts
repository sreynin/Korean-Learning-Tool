import { z } from "zod";
import { jsonOk, parseJsonBody, route } from "@/server/http";
import { setPublished } from "@/server/services/library-service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const bodySchema = z.object({
  published: z.boolean(),
  youtubeUrl: z
    .union([z.url("Enter a full URL, including https://"), z.literal("")])
    .optional(),
});

/** Records that the creator published the video, or takes that back. */
export const PUT = route(async (request: Request, context: RouteContext) => {
  const { id } = await context.params;
  const { published, youtubeUrl } = await parseJsonBody(request, bodySchema);

  return jsonOk(await setPublished(id, published, youtubeUrl || null));
});
