import { getFeatureAvailability } from "@/lib/env";
import { jsonOk, route } from "@/server/http";

export const GET = route(async () => {
  return jsonOk({
    status: "ok" as const,
    timestamp: new Date().toISOString(),
    features: getFeatureAvailability(),
  });
});
