/**
 * Identifiants de mesure, lus au rendu et non au build : l'image Docker est
 * construite sans les variables de l'environnement de production.
 *
 * Un identifiant absent ou mal formé désactive simplement l'outil concerné ;
 * sans aucun identifiant, aucun script tiers n'est chargé.
 */
export interface AnalyticsConfig {
  ga4Id: string | null;
  googleAdsId: string | null;
  metaPixelId: string | null;
  /** Matomo sans cookie, hors consentement. L'origine doit figurer dans la CSP. */
  matomoUrl: string | null;
  matomoSiteId: string | null;
}

function read(name: string, pattern: RegExp): string | null {
  const value = process.env[name]?.trim();
  return value && pattern.test(value) ? value : null;
}

export function analyticsConfig(): AnalyticsConfig {
  return {
    ga4Id: read("GA4_MEASUREMENT_ID", /^G-[A-Z0-9]{4,20}$/),
    googleAdsId: read("GOOGLE_ADS_ID", /^AW-\d{6,15}$/),
    metaPixelId: read("META_PIXEL_ID", /^\d{8,20}$/),
    matomoUrl: read("MATOMO_URL", /^https:\/\/[a-z0-9.-]+$/),
    matomoSiteId: read("MATOMO_SITE_ID", /^\d{1,6}$/),
  };
}

export function hasMatomo(config: AnalyticsConfig): boolean {
  return Boolean(config.matomoUrl && config.matomoSiteId);
}

/** Outils soumis au consentement : sans eux, ni fenêtre de choix ni lien « Cookies ». */
export function hasAnalytics(config: AnalyticsConfig): boolean {
  return Boolean(config.ga4Id || config.googleAdsId || config.metaPixelId);
}

/** Envoi des achats à Meta depuis le serveur : pixel et jeton requis. */
export function metaCapiConfig(): { pixelId: string; token: string; testCode: string | null } | null {
  const pixelId = analyticsConfig().metaPixelId;
  const token = process.env.META_CAPI_TOKEN?.trim();
  if (!pixelId || !token) return null;
  return { pixelId, token, testCode: process.env.META_TEST_EVENT_CODE?.trim() || null };
}
