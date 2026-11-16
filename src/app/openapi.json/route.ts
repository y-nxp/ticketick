import { agentHitFor, trackAgentAfter } from "@/lib/analytics/agent-tracking";
import { publicAppOrigin } from "@/lib/app-url";
import { buildOpenApi } from "@/lib/api/openapi";

export const dynamic = "force-dynamic";

/** Adresse courte de la spécification, en plus de `/api/v1/openapi.json`. */
export async function GET(request: Request) {
  trackAgentAfter(agentHitFor(request, "Doc · openapi.json", "/openapi.json", true));
  return Response.json(buildOpenApi(publicAppOrigin(request)), {
    headers: { "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" },
  });
}
