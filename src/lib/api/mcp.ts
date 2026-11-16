import "server-only";

import { agentHitFor, trackAgentAfter } from "@/lib/analytics/agent-tracking";
import { summarizeCall } from "@/lib/analytics/agents";
import { publicAppOrigin } from "@/lib/app-url";
import { clientIpFrom } from "@/lib/rate-limit";
import { apiJson, CORS_HEADERS, withOutcome } from "./http";
import { jsonSchemaOf } from "./openapi";
import { OPERATIONS, type Operation } from "./operations";
import { authenticate, execute } from "./runtime";
import type { ApiActor } from "./service";

/**
 * Serveur MCP de ticketick (transport « Streamable HTTP », sans état) :
 * chaque requête POST porte un message JSON-RPC et reçoit sa réponse en
 * JSON. Pas de flux SSE ni de session : rien à garder entre deux appels.
 *
 * Sans clé, seuls les outils du catalogue public sont proposés ; avec la
 * clé d'un organisateur (`Authorization: Bearer tt_…`), tous.
 */

const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const DEFAULT_VERSION = "2025-06-18";

type JsonRpcId = string | number | null;
type Message = { jsonrpc?: string; id?: JsonRpcId; method?: string; params?: Record<string, unknown> };

function instructions(actor: ApiActor | null, origin: string): string {
  const common =
    "ticketick.ch is a Swiss ticketing platform for concerts, festivals, theatre and shows. search_events and get_public_event list what is on sale, with booking links: always give the user the event url to book.";
  if (!actor) {
    return `${common} To create or edit events, connect again with an organizer API key (header Authorization: Bearer tt_…), created in the ticketick admin under « API & agents IA ». Docs: ${origin}/developers`;
  }
  return [
    common,
    `You act for the organizer « ${actor.organizerName} ».`,
    "Workflow: whoami (rules) → list_venues and list_categories → create_event with its sessions and ticket types in one call → check the returned event and give the user its admin link → publish_event only if the user asked and the key may publish.",
    actor.canPublish
      ? "This key may publish."
      : "This key may not publish: events stay drafts until a person publishes them in the admin.",
    "Times without offset are Swiss local time (Europe/Zurich). Prices are in CHF. Texts are objects per language { fr, en, de, it }: write French when the audience is French-speaking, and add other languages when you can translate faithfully.",
    "Pass an idempotencyKey on creations so that a retry never duplicates an event.",
  ].join(" ");
}

function toTool(op: Operation) {
  return {
    name: op.name,
    title: op.title,
    description: op.description,
    inputSchema: jsonSchemaOf(op.input),
    annotations: {
      title: op.title,
      readOnlyHint: Boolean(op.readOnly),
      destructiveHint: Boolean(op.destructive),
      idempotentHint: Boolean(op.readOnly),
      openWorldHint: false,
    },
  };
}

function rpcResult(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function dispatch(
  message: Message,
  actor: ApiActor | null,
  ip: string,
  origin: string,
): Promise<unknown> {
  const id = message.id ?? null;
  const params = message.params ?? {};
  switch (message.method) {
    case "initialize": {
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : DEFAULT_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: "ticketick",
          title: "ticketick — Swiss event ticketing",
          version: "1.0.0",
          websiteUrl: `${origin}/developers`,
        },
        instructions: instructions(actor, origin),
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, {
        tools: OPERATIONS.filter((o) => actor || o.auth === "public").map(toTool),
      });
    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      const op = OPERATIONS.find((o) => o.name === name);
      if (!op) return rpcError(id, -32602, `Unknown tool: ${name}`);
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      const outcome = await execute(op, actor, args, {
        ip,
        idempotencyKey: typeof args.idempotencyKey === "string" ? args.idempotencyKey : null,
      });
      const body = outcome.body as Record<string, unknown>;
      return rpcResult(id, {
        content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
        structuredContent: body,
        isError: outcome.status >= 400,
      });
    }
    case "resources/list":
      return rpcResult(id, { resources: [] });
    case "resources/templates/list":
      return rpcResult(id, { resourceTemplates: [] });
    case "prompts/list":
      return rpcResult(id, { prompts: [] });
    default:
      return rpcError(id, -32601, `Method not found: ${message.method ?? "(none)"}`);
  }
}

/**
 * Passage MCP pour le site Matomo des agents : la connexion (avec le nom du
 * client, « claude-ai », « openai-mcp »…), la liste des outils et chaque appel
 * d'outil avec ce qu'il demandait.
 */
function trackMcp(request: Request, message: Message, actor: ApiActor | null, reply: unknown) {
  const params = message.params ?? {};
  let action: string;
  let detail: string;
  if (message.method === "initialize") {
    const client = (params.clientInfo ?? {}) as { name?: unknown; version?: unknown };
    action = "MCP · connexion";
    detail = [client.name, client.version].filter((v) => typeof v === "string" && v).join(" ") || "client inconnu";
    if (actor) detail = `${actor.organizerName} · ${detail}`;
  } else if (message.method === "tools/list") {
    action = "MCP · liste des outils";
    detail = actor ? actor.organizerName : "sans clé";
  } else if (message.method === "tools/call") {
    const name = typeof params.name === "string" ? params.name : "?";
    const args = (params.arguments ?? {}) as Record<string, unknown>;
    const result = (reply as { result?: { isError?: boolean; structuredContent?: unknown } }).result;
    const body = result?.structuredContent ?? {};
    const status = result?.isError ? 400 : 200;
    action = `MCP · ${name}`;
    detail = withOutcome(summarizeCall(name, args, actor?.organizerName ?? null), { status, body });
  } else {
    return;
  }
  trackAgentAfter(agentHitFor(request, action, detail, true));
}

export async function handleMcp(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { ...CORS_HEADERS, allow: "POST, OPTIONS" } });
  }
  const ip = clientIpFrom(request.headers);
  const auth = await authenticate(request.headers, ip);
  if (auth.kind === "error") {
    const err = auth.outcome.body as { error: { message: string } };
    return apiJson(rpcError(null, -32001, err.error.message), auth.outcome.status);
  }
  const actor = auth.kind === "key" ? auth.actor : null;

  let payload: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 1_000_000) return apiJson(rpcError(null, -32600, "Request over 1 MB."), 413);
    payload = JSON.parse(raw);
  } catch {
    return apiJson(rpcError(null, -32700, "Parse error"), 400);
  }

  const batch = Array.isArray(payload);
  const messages = (batch ? payload : [payload]) as Message[];
  const origin = publicAppOrigin(request);
  const replies: unknown[] = [];
  for (const message of messages) {
    if (!message || typeof message !== "object" || message.jsonrpc !== "2.0") {
      replies.push(rpcError(null, -32600, "Invalid JSON-RPC message"));
      continue;
    }
    // Notifications (sans id) et réponses du client : rien à renvoyer.
    if (message.id === undefined || !message.method) continue;
    const reply = await dispatch(message, actor, ip, origin);
    trackMcp(request, message, actor, reply);
    replies.push(reply);
  }
  if (replies.length === 0) {
    return new Response(null, { status: 202, headers: CORS_HEADERS });
  }
  return apiJson(batch ? replies : replies[0]);
}
