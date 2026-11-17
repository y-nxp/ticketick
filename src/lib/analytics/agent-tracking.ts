import { createHash } from "node:crypto";
import { after } from "next/server";
import { identifyAgent, matomoAgentParams, type AgentHit } from "./agents";

/**
 * Envoi d'un passage d'agent au site Matomo des agents
 * (`MATOMO_AGENTS_SITE_ID`). Sans ce réglage, rien ne part. Toujours appelé
 * après la réponse (`after`, `waitUntil`) : un Matomo lent ou injoignable
 * ne ralentit ni ne casse jamais le site.
 */
export function agentsMatomoConfig(): { url: string; siteId: string } | null {
  const url = process.env.MATOMO_URL?.trim();
  const siteId = process.env.MATOMO_AGENTS_SITE_ID?.trim();
  if (!url || !/^https:\/\/[a-z0-9.-]+$/.test(url) || !siteId || !/^\d{1,6}$/.test(siteId)) return null;
  return { url, siteId };
}

/** Même lecture que `clientIpFrom`, sans `server-only` : utilisable dans `proxy.ts`. */
function requestIp(headers: Headers): string {
  return headers.get("cf-connecting-ip")?.trim() || headers.get("x-real-ip")?.trim() || "inconnue";
}

/**
 * Passage d'agent pour une requête : `null` si c'est un humain (pages) ou si
 * le suivi n'est pas configuré. `anyCaller` pour l'API et le serveur MCP.
 */
export function agentHitFor(
  request: Request,
  action: string,
  detail: string,
  anyCaller: boolean,
): AgentHit | null {
  if (!agentsMatomoConfig()) return null;
  const userAgent = request.headers.get("user-agent") ?? "";
  const agent = identifyAgent(userAgent, anyCaller);
  if (!agent) return null;
  return { agent, url: request.url, action, detail, userAgent, ip: requestIp(request.headers) };
}

/** Envoi après la réponse, depuis une route (API, MCP, llms.txt). */
export function trackAgentAfter(hit: AgentHit | null): void {
  if (hit) after(() => sendAgentHit(hit));
}

export async function sendAgentHit(hit: AgentHit): Promise<void> {
  const config = agentsMatomoConfig();
  if (!config) return;
  const visitorId = createHash("sha256").update(`${hit.agent.label}|${hit.ip}`).digest("hex").slice(0, 16);
  try {
    await fetch(`${config.url}/matomo.php`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: matomoAgentParams(hit, config.siteId, visitorId),
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // Mesure perdue : sans conséquence pour l'agent ni pour le site.
  }
}
