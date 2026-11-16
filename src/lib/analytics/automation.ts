/**
 * Robots et agents IA qui exécutent le JavaScript des pages : on ne les
 * compte pas dans Matomo. Les robots qui lisent le HTML sans l'exécuter
 * (la plupart des robots d'indexation), l'API, le serveur MCP et llms.txt
 * n'atteignent jamais Matomo de toute façon.
 *
 * `bot/` plutôt que `bot` : le téléphone Cubot (« CUBOT P50 ») est un humain.
 */
export const AUTOMATED_USER_AGENT =
  /bot\/|bot;|crawler|spider|headless|lighthouse|pagespeed|chatgpt|claude-|perplexity|oai-|anthropic|externalagent|google-extended|bytespider|ia_archiver|python-|curl\/|wget|scrapy|phantomjs|selenium|puppeteer|playwright/i;

/** `webdriver` est vrai dans Playwright, Puppeteer et Selenium, même avec un navigateur normal. */
export function isAutomatedVisitor(userAgent: string, webdriver: boolean | undefined): boolean {
  return webdriver === true || AUTOMATED_USER_AGENT.test(userAgent);
}
