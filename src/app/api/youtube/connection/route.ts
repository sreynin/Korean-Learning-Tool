import { jsonOk, route } from "@/server/http";
import {
  disconnectYouTube,
  getPublishCapability,
} from "@/server/services/publish-service";

/**
 * The connected channel, and whether this installation could publish at all.
 *
 * Returns the channel a creator connected — never a token. `PublishCapability`
 * has no field that could carry one.
 */
export const GET = route(async () => {
  return jsonOk(await getPublishCapability());
});

/** Revokes the grant with Google, then forgets the row. */
export const DELETE = route(async () => {
  await disconnectYouTube();
  return jsonOk(await getPublishCapability());
});
