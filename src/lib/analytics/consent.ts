/**
 * Choix du visiteur, par finalité. Les fonctions de base (panier, session,
 * langue, sécurité) ne demandent pas d'accord et n'y figurent donc pas.
 *
 * - `statistics` : mesure d'audience (Google Analytics) ;
 * - `ads` : mesure des annonces (Google Ads, pixel Meta, envoi serveur à Meta) ;
 * - `personalization` : annonces personnalisées ailleurs, qui suppose `ads`.
 */
export const CONSENT_COOKIE = "tt_consent";

export interface Consent {
  statistics: boolean;
  ads: boolean;
  personalization: boolean;
}

export const ALL_GRANTED: Consent = { statistics: true, ads: true, personalization: true };
export const ALL_DENIED: Consent = { statistics: false, ads: false, personalization: false };

/** Valeur du cookie : `s1.a0.p0`. Les anciennes valeurs `granted`/`denied` valent tout ou rien. */
export function parseConsent(value: string | null | undefined): Consent | null {
  if (value === "granted") return ALL_GRANTED;
  if (value === "denied") return ALL_DENIED;
  const match = value?.match(/^s([01])\.a([01])\.p([01])$/);
  if (!match) return null;
  const ads = match[2] === "1";
  return { statistics: match[1] === "1", ads, personalization: ads && match[3] === "1" };
}

export function serializeConsent(consent: Consent): string {
  const flag = (on: boolean) => (on ? "1" : "0");
  return `s${flag(consent.statistics)}.a${flag(consent.ads)}.p${flag(consent.ads && consent.personalization)}`;
}

/** États de Consent Mode v2 pour Google. */
export function googleConsentState(consent: Consent | null) {
  const state = (on: boolean | undefined) => (on ? "granted" : "denied");
  return {
    ad_storage: state(consent?.ads),
    ad_user_data: state(consent?.ads),
    ad_personalization: state(consent?.ads && consent.personalization),
    analytics_storage: state(consent?.statistics),
  };
}

/** Diffusé sur `window` quand le choix change, et pour rouvrir la fenêtre. */
export const CONSENT_CHANGED_EVENT = "tt:consent-changed";
export const CONSENT_OPEN_EVENT = "tt:consent-open";

export function readConsentCookie(): Consent | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE}=([^;]*)`));
  return parseConsent(match?.[1]);
}

export function writeConsentCookie(consent: Consent): void {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${serializeConsent(consent)}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${secure}`;
  window.dispatchEvent(new CustomEvent<Consent>(CONSENT_CHANGED_EVENT, { detail: consent }));
}
