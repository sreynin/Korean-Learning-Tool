import { jsonOk, route } from "@/server/http";
import { getProjectStats } from "@/server/services/project-service";

export const GET = route(async (_request: Request) => {
  return jsonOk(await getProjectStats());
});
