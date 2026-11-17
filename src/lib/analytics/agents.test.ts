import { test } from "node:test";
import assert from "node:assert/strict";
import { agentCategory, identifyAgent, matomoAgentParams, pageAction, summarizeCall } from "./agents";

const SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

test("agents connus : qui et pourquoi", () => {
  const cases: [string, string][] = [
    ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ChatGPT-User/1.0; +https://openai.com/bot)", "ChatGPT · pour un utilisateur"],
    ["Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)", "ChatGPT · recherche"],
    ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)", "OpenAI · entraînement"],
    ["Mozilla/5.0 (compatible; Claude-User/1.0; +Claude-User@anthropic.com)", "Claude · pour un utilisateur"],
    ["Mozilla/5.0 (compatible; Claude-SearchBot/1.0)", "Claude · recherche"],
    ["Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", "Anthropic · entraînement"],
    ["Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)", "Perplexity · recherche"],
    ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "Google · recherche"],
    ["meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)", "Meta AI · entraînement"],
    ["openai-mcp/1.0.0", "ChatGPT · pour un utilisateur"],
  ];
  for (const [ua, expected] of cases) {
    const agent = identifyAgent(ua);
    assert.ok(agent, ua);
    assert.equal(agentCategory(agent), expected, ua);
  }
});

test("pages : un humain ou une sonde ne sont pas suivis", () => {
  assert.equal(identifyAgent(SAFARI), null);
  assert.equal(identifyAgent(null), null);
  assert.equal(identifyAgent("Mozilla/5.0+(compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)"), null);
  assert.equal(identifyAgent("Mozilla/5.0 (Linux; Android 13; CUBOT P50) Chrome/141.0 Mobile Safari/537.36"), null);
  assert.equal(identifyAgent("Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)")?.label, "Autre (SemrushBot)");
});

test("API et MCP : tout appelant est un programme", () => {
  assert.equal(identifyAgent("python-httpx/0.28.1", true)?.label, "Autre (python-httpx)");
  assert.equal(identifyAgent("", true)?.label, "Sans agent utilisateur");
  assert.equal(identifyAgent("MyAgent/2.0", true)?.label, "Autre (MyAgent)");
  assert.equal(identifyAgent("claude-code/2.1.301", true)?.label, "Claude Code");
});

test("type de page lu dans l'adresse", () => {
  assert.equal(pageAction("/"), "Page · accueil");
  assert.equal(pageAction("/en"), "Page · accueil");
  assert.equal(pageAction("/de/events/gnymf-2026"), "Page · fiche spectacle");
  assert.equal(pageAction("/organizer"), "Page · pour les organisateurs");
  assert.equal(pageAction("/it/help"), "Page · informations");
  assert.equal(pageAction("/go/chœur"), "Page · boutique intégrée");
});

test("ce que l'agent demandait, sans la clé", () => {
  assert.equal(
    summarizeCall("search_events", { q: "jazz", city: "Genève", from: "2026-12-01" }, null),
    "« jazz » · Genève · 2026-12-01 → …",
  );
  assert.equal(summarizeCall("search_events", {}, null), "tout le catalogue");
  assert.equal(summarizeCall("get_public_event", { slug: "beethoven-2026" }, null), "beethoven-2026");
  assert.equal(
    summarizeCall(
      "create_event",
      { title: { en: "Christmas concert" }, sessions: [{}, {}], publish: true, apiKey: "tt_secret" },
      "Chœur Cantabile",
    ),
    "Chœur Cantabile · « Christmas concert » · 2 séance(s) · publier",
  );
  assert.equal(summarizeCall("delete_session", { sessionId: "s1" }, "Org"), "Org · s1");
  assert.ok(summarizeCall("search_events", { q: "x".repeat(500) }, null).length <= 200);
});

test("paramètres Matomo : robots acceptés, événement à trois niveaux", () => {
  const p = matomoAgentParams(
    {
      agent: { label: "ChatGPT", kind: "user" },
      url: "https://ticketick.ch/events/x",
      action: "Page · fiche spectacle",
      detail: "/events/x",
      userAgent: "ChatGPT-User/1.0",
      ip: "1.2.3.4",
    },
    "10",
    "abcdef0123456789",
  );
  assert.equal(p.get("idsite"), "10");
  assert.equal(p.get("bots"), "1");
  assert.equal(p.get("e_c"), "ChatGPT · pour un utilisateur");
  assert.equal(p.get("e_a"), "Page · fiche spectacle");
  assert.equal(p.get("e_n"), "/events/x");
  assert.equal(p.get("_id"), "abcdef0123456789");
  assert.equal(p.get("uid"), "ChatGPT · pour un utilisateur");
  assert.equal(p.get("cip"), null);
});
