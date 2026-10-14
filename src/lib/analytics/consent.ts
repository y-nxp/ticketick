/** Choix du visiteur sur la mesure d'audience et la publicité. */
export const CONSENT_COOKIE = "tt_consent";

export type Consent = "granted" | "denied";

export function parseConsent(value: string | null | undefined): Consent | null {
  return value === "granted" || value === "denied" ? value : null;
}

/** Diffusé sur `window` quand le choix change, et pour rouvrir le bandeau. */
export const CONSENT_CHANGED_EVENT = "tt:consent-changed";
export const CONSENT_OPEN_EVENT = "tt:consent-open";

export function readConsentCookie(): Consent | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE}=([^;]*)`));
  return parseConsent(match?.[1]);
}

export function writeConsentCookie(consent: Consent): void {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${consent}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${secure}`;
  window.dispatchEvent(new CustomEvent<Consent>(CONSENT_CHANGED_EVENT, { detail: consent }));
}
