import "server-only";

import { jsonSchemaOf } from "./openapi";
import { OPERATIONS } from "./operations";
import { searchPublicEvents } from "./service";

/**
 * Textes pour les modèles de langue : `/llms.txt` (sommaire et spectacles
 * en vente) et `/llms-full.txt` (guide complet de l'API). En anglais, la
 * langue que tous les agents lisent ; les spectacles restent en français.
 */

const PITCH =
  "ticketick.ch is a Swiss ticketing platform for concerts, festivals, opera, theatre and shows. Organizers sell tickets online (card, bank transfer, PayPal), at the door with a scanning app, and through resellers. Buyers get e-tickets in French, English, German or Italian.";

function frDate(local: string): string {
  const [d, time] = local.split("T");
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y} ${time}`;
}

async function catalogueLines(limit: number): Promise<string[]> {
  const { events } = await searchPublicEvents({ limit });
  return events.map((e) => {
    const s = e.sessions[0];
    const where = s?.venue ? `${s.venue.name}, ${s.venue.city}` : "";
    const more = e.sessions.length > 1 ? ` (+${e.sessions.length - 1} dates)` : "";
    const price = e.priceFrom != null ? ` — from CHF ${e.priceFrom}` : "";
    return `- [${e.title}](${e.url}): ${s ? frDate(s.startsAtLocal) : ""}${more}, ${where}${price}, by ${e.organizer.name}`;
  });
}

export async function llmsTxt(origin: string): Promise<string> {
  const lines = await catalogueLines(100);
  return [
    "# ticketick",
    "",
    `> ${PITCH}`,
    "",
    "AI agents can search the public catalogue without any key, and organizers can let their AI agent create and publish events, sessions and ticket types through the API or the MCP server.",
    "",
    "## For AI agents and developers",
    "",
    `- [Developer guide](${origin}/developers): API keys, MCP server, REST API, rules`,
    `- [MCP server](${origin}/api/mcp): Streamable HTTP endpoint. Without a key: search_events, get_public_event. With an organizer key (Authorization: Bearer tt_…): create_event, add_session, add_ticket_type, publish_event and more`,
    `- [OpenAPI 3.1 specification](${origin}/api/v1/openapi.json): REST API at ${origin}/api/v1`,
    `- [Full API guide for LLMs](${origin}/llms-full.txt): every operation with its input schema`,
    `- [Public catalogue API](${origin}/api/v1/public/events): JSON list of events on sale (q, city, from, to, locale)`,
    "",
    "## Events on sale",
    "",
    ...(lines.length ? lines : ["- No public event on sale right now."]),
    "",
    "## Optional",
    "",
    `- [How it works](${origin}/how-it-works): buying tickets on ticketick`,
    `- [For organizers](${origin}/organizer): selling tickets with ticketick`,
    `- [Help centre](${origin}/help)`,
    `- [Contact](${origin}/contact)`,
    "",
  ].join("\n");
}

export function apiGuideMarkdown(origin: string): string {
  const ops = OPERATIONS.map((op) =>
    [
      `### ${op.name} — ${op.title}`,
      "",
      `\`${op.method} ${origin}/api/v1${op.path}\`${op.auth === "public" ? " · no key" : ""}${op.creates ? " · accepts Idempotency-Key" : ""}`,
      "",
      op.description,
      "",
      "```json",
      JSON.stringify(jsonSchemaOf(op.input), null, 2),
      "```",
      "",
    ].join("\n"),
  );
  return [
    "# ticketick API and MCP server",
    "",
    `> ${PITCH}`,
    "",
    "## Access",
    "",
    "- Public catalogue (search_events, get_public_event): open, no key, 60 requests per minute.",
    "- Everything else acts for one organizer, with an API key `tt_…` sent as `Authorization: Bearer tt_…` (or `X-Api-Key`). Organizers create keys in the ticketick admin, page « API & agents IA ». 120 requests per minute per key.",
    "- A key is either draft-only (default) or allowed to publish. A draft-only key cannot change events that are already online.",
    "",
    "## Connect an AI agent (MCP)",
    "",
    `Endpoint: \`${origin}/api/mcp\` (Streamable HTTP, stateless, JSON responses). Tools are the operations below, same names and inputs.`,
    "",
    "```sh",
    `claude mcp add --transport http ticketick ${origin}/api/mcp --header "Authorization: Bearer tt_…"`,
    "```",
    "",
    "```json",
    JSON.stringify({ mcpServers: { ticketick: { type: "http", url: `${origin}/api/mcp`, headers: { Authorization: "Bearer tt_…" } } } }, null, 2),
    "```",
    "",
    "## REST",
    "",
    `Base URL \`${origin}/api/v1\`, JSON in and out. OpenAPI: ${origin}/api/v1/openapi.json`,
    "",
    "```sh",
    `curl -X POST ${origin}/api/v1/events \\`,
    '  -H "Authorization: Bearer tt_…" -H "Content-Type: application/json" \\',
    '  -H "Idempotency-Key: concert-2026-12-05" \\',
    `  -d '${JSON.stringify({
      title: { fr: "Concert de Noël", en: "Christmas concert" },
      description: { fr: "Chœur et orchestre." },
      sessions: [
        {
          startsAt: "2026-12-05T20:00",
          venue: { name: "Temple", city: "Rougemont" },
          capacity: 300,
          ticketTypes: [
            { name: { fr: "Plein tarif" }, price: 45, quantity: 250 },
            { name: { fr: "Étudiant" }, price: 20, quantity: 50 },
          ],
        },
      ],
    })}'`,
    "```",
    "",
    "Errors: `{ \"error\": { \"code\", \"message\", \"details\" } }` with the HTTP status. Validation errors list each invalid field in `details.issues`.",
    "",
    "## Rules",
    "",
    "- Times without offset are Swiss local time (Europe/Zurich). Prices are in CHF (decimal, e.g. 32.5).",
    "- Texts are per language: `{ \"fr\": \"…\", \"en\": \"…\", \"de\": \"…\", \"it\": \"…\" }`, at least one. French is the fallback shown when a language is missing.",
    "- Events are created as drafts. `publish: true` or publish_event put them online, only with a key allowed to publish, an upcoming session and (for online sale) a ticket type.",
    "- Nothing with sold tickets can be deleted; a session with sales keeps its date and venue (the organizer uses « Programme modifié » in the admin, which informs buyers).",
    "- Venues: reuse a venueId from list_venues, or pass `venue: { name, city }` (an existing venue with the same name and city is reused).",
    "- Send an idempotencyKey (or the Idempotency-Key header) on creations: a retry returns the first result instead of a duplicate.",
    "",
    "## Operations",
    "",
    ...ops,
  ].join("\n");
}

export async function llmsFullTxt(origin: string): Promise<string> {
  const lines = await catalogueLines(500);
  return [
    apiGuideMarkdown(origin),
    "## Events on sale",
    "",
    ...(lines.length ? lines : ["- No public event on sale right now."]),
    "",
  ].join("\n");
}
