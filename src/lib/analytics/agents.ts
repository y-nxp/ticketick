/**
 * Passages des robots et agents IA, envoyés à un site Matomo à part
 * (« ticketick.ch — agents IA ») : les statistiques des humains restent
 * propres, et l'on voit quel agent est venu, par où et pour quoi faire.
 *
 * Dans Matomo, rapport Comportement → Événements :
 * - catégorie = l'agent (« ChatGPT · pour un utilisateur ») ;
 * - action = le canal et ce qu'il a fait (« MCP · search_events ») ;
 * - nom = le détail (« « jazz » · Genève », adresse de la page…).
 *
 * Pur : utilisé par `proxy.ts`, l'API, le serveur MCP et les tests.
 */

export type AgentKind = "user" | "search" | "training" | "program";

export interface Agent {
  label: string;
  kind: AgentKind;
}

const KIND_LABEL: Record<AgentKind, string> = {
  user: "pour un utilisateur",
  search: "recherche",
  training: "entraînement",
  program: "programme",
};

/** Le plus précis d'abord : `ChatGPT-User` avant `GPTBot`, `Claude-SearchBot` avant `ClaudeBot`. */
const KNOWN: [RegExp, string, AgentKind][] = [
  [/ChatGPT-User/i, "ChatGPT", "user"],
  [/OAI-SearchBot/i, "ChatGPT", "search"],
  [/GPTBot/i, "OpenAI", "training"],
  [/openai-mcp/i, "ChatGPT", "user"],
  [/Claude-User/i, "Claude", "user"],
  [/Claude-SearchBot/i, "Claude", "search"],
  [/ClaudeBot|anthropic-ai/i, "Anthropic", "training"],
  [/claude-code/i, "Claude Code", "program"],
  [/Perplexity-User/i, "Perplexity", "user"],
  [/PerplexityBot/i, "Perplexity", "search"],
  [/MistralAI-User/i, "Le Chat (Mistral)", "user"],
  [/meta-externalfetcher/i, "Meta AI", "user"],
  [/meta-externalagent/i, "Meta AI", "training"],
  [/DuckAssistBot/i, "DuckDuckGo", "user"],
  [/Google-Agent|GoogleAgent/i, "Gemini", "user"],
  [/Googlebot|Google-InspectionTool|GoogleOther/i, "Google", "search"],
  [/bingbot|BingPreview/i, "Bing / Copilot", "search"],
  [/Applebot/i, "Apple", "search"],
  [/DuckDuckBot/i, "DuckDuckGo", "search"],
  [/YandexBot/i, "Yandex", "search"],
  [/Amazonbot/i, "Amazon", "search"],
  [/YouBot/i, "You.com", "search"],
  [/Bytespider/i, "ByteDance", "training"],
  [/CCBot/i, "Common Crawl", "training"],
  [/cohere/i, "Cohere", "training"],
  [/Diffbot/i, "Diffbot", "training"],
  [/HeadlessChrome/i, "Navigateur automatisé", "program"],
  [/Cursor/i, "Cursor", "program"],
];

/** Sondes de disponibilité : pas des agents, et elles passent toutes les minutes. */
const MONITOR = /uptime|pingdom|statuscake|betteruptime|better stack|site24x7|healthcheck|monitor/i;

const GENERIC_BOT = /bot\/|bot;|crawler|spider|scrapy|python-|curl\/|wget|go-http-client|node-fetch|undici|axios|okhttp|java\//i;

function productToken(userAgent: string): string {
  const compatible = /compatible;\s*([^;/)]+)/i.exec(userAgent)?.[1];
  const token = compatible ?? userAgent.split(/[\s/;(]/)[0];
  return token.trim().slice(0, 40) || "inconnu";
}

/**
 * Agent derrière l'agent utilisateur. Pour une page du site, `null` = un humain
 * (ou une sonde) : rien n'est envoyé. Pour l'API et le serveur MCP
 * (`anyCaller`), tout appelant est un programme.
 */
export function identifyAgent(userAgent: string | null, anyCaller = false): Agent | null {
  const ua = userAgent?.trim() ?? "";
  if (ua && MONITOR.test(ua)) return null;
  for (const [pattern, label, kind] of KNOWN) {
    if (pattern.test(ua)) return { label, kind };
  }
  if (!ua) return anyCaller ? { label: "Sans agent utilisateur", kind: "program" } : null;
  if (GENERIC_BOT.test(ua)) return { label: `Autre (${productToken(ua)})`, kind: "program" };
  return anyCaller ? { label: `Autre (${productToken(ua)})`, kind: "program" } : null;
}

export function agentCategory(agent: Agent): string {
  return `${agent.label} · ${KIND_LABEL[agent.kind]}`;
}

const LOCALE_PREFIX = /^\/(?:en|de|it|es)(?=\/|$)/;

/** Type de page lu dans l'adresse, pour l'action Matomo. */
export function pageAction(pathname: string): string {
  const path = pathname.replace(LOCALE_PREFIX, "") || "/";
  if (path === "/") return "Page · accueil";
  if (/^\/events\/[^/]+/.test(path)) return "Page · fiche spectacle";
  if (/^\/(go|embed)\//.test(path)) return "Page · boutique intégrée";
  if (/^\/organizer\/?$/.test(path)) return "Page · pour les organisateurs";
  if (/^\/developers/.test(path)) return "Page · développeurs";
  if (/^\/(how-it-works|help|about|contact|friends|terms|privacy)(\/|$)/.test(path)) return "Page · informations";
  return "Page · autre";
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstText(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return str(value);
  const t = value as Record<string, unknown>;
  return str(t.fr) ?? str(t.en) ?? str(t.de) ?? str(t.it) ?? str(t.es);
}

/**
 * Ce que l'agent demandait, en clair et sans donnée sensible : la recherche,
 * le spectacle visé, l'organisateur pour qui il agit. Jamais la clé.
 */
export function summarizeCall(
  operation: string,
  input: Record<string, unknown>,
  organizer: string | null,
): string {
  const parts: string[] = [];
  if (organizer) parts.push(organizer);
  switch (operation) {
    case "search_events": {
      const q = str(input.q);
      if (q) parts.push(`« ${q} »`);
      const city = str(input.city);
      if (city) parts.push(city);
      const from = str(input.from);
      const to = str(input.to);
      if (from || to) parts.push(`${from ?? "…"} → ${to ?? "…"}`);
      if (!q && !city && !from && !to) parts.push("tout le catalogue");
      break;
    }
    case "get_public_event":
      parts.push(str(input.slug) ?? "?");
      break;
    case "create_event": {
      parts.push(`« ${firstText(input.title) ?? "?"} »`);
      if (Array.isArray(input.sessions)) parts.push(`${input.sessions.length} séance(s)`);
      if (input.publish === true) parts.push("publier");
      break;
    }
    case "update_event":
      parts.push(str(input.eventId) ?? "?");
      if (input.title) parts.push(`« ${firstText(input.title) ?? "?"} »`);
      break;
    case "list_venues":
      if (str(input.q)) parts.push(`« ${str(input.q)} »`);
      break;
    default: {
      const id = str(input.eventId) ?? str(input.sessionId) ?? str(input.ticketTypeId);
      if (id) parts.push(id);
    }
  }
  return parts.join(" · ").slice(0, 200);
}

export interface AgentHit {
  agent: Agent;
  /** Adresse demandée, complète. */
  url: string;
  action: string;
  detail: string;
  userAgent: string;
  ip: string;
}

/**
 * Paramètres de l'API de suivi Matomo. `bots=1` : Matomo écarte sinon les
 * robots connus. Le numéro de visiteur regroupe les passages d'un même agent
 * depuis une même adresse.
 */
export function matomoAgentParams(hit: AgentHit, siteId: string, visitorId: string): URLSearchParams {
  return new URLSearchParams({
    idsite: siteId,
    rec: "1",
    apiv: "1",
    bots: "1",
    send_image: "0",
    rand: Math.random().toString(36).slice(2, 10),
    _id: visitorId,
    // Tous les passages arrivent de l'adresse du serveur : sans identifiant,
    // Matomo fondrait tous les agents dans les mêmes visites. Le rapport
    // « User IDs » liste ainsi un agent par ligne.
    uid: agentCategory(hit.agent),
    url: hit.url,
    ua: hit.userAgent || "inconnu",
    e_c: agentCategory(hit.agent),
    e_a: hit.action,
    e_n: hit.detail || "—",
  });
}
