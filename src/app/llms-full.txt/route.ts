import { agentHitFor, trackAgentAfter } from "@/lib/analytics/agent-tracking";
import { publicAppOrigin } from "@/lib/app-url";
import { llmsFullTxt } from "@/lib/api/docs";

// Le catalogue change en continu, et la base n'est pas joignable au build.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const body = await llmsFullTxt(publicAppOrigin(request));
  trackAgentAfter(agentHitFor(request, "Doc · llms-full.txt", "/llms-full.txt", true));
  return new Response(body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=900",
      "access-control-allow-origin": "*",
    },
  });
}
