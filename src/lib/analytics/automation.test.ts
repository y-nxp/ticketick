import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { isAutomatedVisitor } from "./automation";
import { matomoInitSnippet } from "./snippets";

const HUMANS = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0",
  "Mozilla/5.0 (Linux; Android 13; CUBOT P50 Build/TP1A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0",
];

const AGENTS = [
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
  "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ChatGPT-User/1.0; +https://openai.com/bot)",
  "Mozilla/5.0 (compatible; Claude-User/1.0; +Claude-User@anthropic.com)",
  "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/142.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/142.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse",
  "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
  "python-requests/2.32.3",
];

test("les visiteurs humains sont comptés", () => {
  for (const ua of HUMANS) assert.equal(isAutomatedVisitor(ua, false), false, ua);
});

test("robots, agents IA et navigateurs pilotés ne sont pas comptés", () => {
  for (const ua of AGENTS) assert.equal(isAutomatedVisitor(ua, false), true, ua);
  // Agent qui pilote un vrai Chrome (Playwright, Puppeteer…) : seul webdriver le trahit.
  assert.equal(isAutomatedVisitor(HUMANS[1], true), true);
});

function runSnippet(userAgent: string, webdriver: boolean) {
  const appended: string[] = [];
  const window: Record<string, unknown> = {};
  const context = {
    window,
    navigator: { userAgent, webdriver },
    document: {
      createElement: () => ({}),
      head: { appendChild: (el: { src: string }) => appended.push(el.src) },
    },
  };
  vm.runInNewContext(matomoInitSnippet("https://stats.example.com", "1"), context);
  return { paq: window._paq as unknown[][] | undefined, appended };
}

test("l'amorce Matomo ne se lance pas pour un agent", () => {
  const human = runSnippet(HUMANS[0], false);
  assert.ok(human.paq?.some((c) => c[0] === "setSiteId"));
  assert.deepEqual(human.appended, ["https://stats.example.com/matomo.js"]);

  for (const [ua, webdriver] of [[AGENTS[0], false], [HUMANS[1], true]] as const) {
    const agent = runSnippet(ua, webdriver);
    assert.equal(agent.paq, undefined);
    assert.deepEqual(agent.appended, []);
  }
});
