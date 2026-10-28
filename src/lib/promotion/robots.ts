/**
 * Robots qui suivent un lien sans être un visiteur : aperçus de lien des
 * réseaux et messageries, moteurs de recherche, outils en ligne de commande.
 * Ils reçoivent la même redirection mais ne sont ni comptés ni marqués d'un
 * cookie (docs/module-promotion.md, § 5.1).
 *
 * Mieux vaut manquer un robot exotique (un clic de trop) que prendre un
 * visiteur pour un robot : les motifs restent ceux d'agents connus, plus les
 * mots que les robots revendiquent eux-mêmes.
 */
const BOT_PATTERNS: RegExp[] = [
  // Meta : aperçus Facebook, Messenger, Instagram, WhatsApp ; robot d'IA.
  /facebookexternalhit/i,
  /facebookcatalog/i,
  /facebot/i,
  /meta-externalagent/i,
  /meta-externalfetcher/i,
  /whatsapp/i,
  // Autres réseaux et messageries.
  /twitterbot/i,
  /linkedinbot/i,
  /slackbot|slack-imgproxy/i,
  /telegrambot/i,
  /discordbot/i,
  /pinterest(bot)?\//i,
  /skypeuripreview/i,
  /redditbot/i,
  /embedly/i,
  // Moteurs de recherche.
  /googlebot|google-inspectiontool|adsbot-google|mediapartners-google/i,
  /bingbot|bingpreview/i,
  /applebot/i,
  /duckduckbot/i,
  /baiduspider/i,
  // Outils sans navigateur.
  /^curl\//i,
  /^wget\//i,
  /python-requests|python-urllib|aiohttp/i,
  /^go-http-client\//i,
  /headlesschrome/i,
  // Ce que les robots disent d'eux-mêmes (« AhrefsBot/7.0 », « bot; »), sans
  // prendre un téléphone Cubot pour un robot.
  /bot\/|bot;|\bbot\b|crawler|spider|preview/i,
];

/** Agent sans User-Agent, ou reconnu comme robot. */
export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  const ua = userAgent?.trim() ?? "";
  if (!ua) return true;
  return BOT_PATTERNS.some((pattern) => pattern.test(ua));
}
