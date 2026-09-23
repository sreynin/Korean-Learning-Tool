import { jsonOk, route } from "@/server/http";
import { getProjectStats } from "@/server/services/project-service";

export const GET = route(async () => {
  return jsonOk(await getProjectStats());
});
