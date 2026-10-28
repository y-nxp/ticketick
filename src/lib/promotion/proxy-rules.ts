import { codeFromCampaignUtm, normalizeCampaignCode } from "./campaign-code";
import { parsePromotionCookie, type PromotionClick } from "./cookie";
import { isBotUserAgent } from "./robots";
import { sourceFromUtm } from "./source";

/**
 * Ce que `src/proxy.ts` décide pour la promotion, sans base de données : le
 * proxy ne valide que le FORMAT d'un code, l'existence de la campagne se
 * vérifie dans la route `/p/[code]` et à la création de la commande.
 */

const CAMPAIGN_LINK = /^\/p(?:\/|$)/;
const CAMPAIGN_LINK_CODE = /^\/p\/([^/]+)\/?$/;

/**
 * Lien de campagne `/p/…` : `{ code }` si le format convient, `{ code: null }`
 * sinon (à renvoyer vers l'accueil). `null` pour tout autre chemin.
 */
export function campaignLink(pathname: string): { code: string | null } | null {
  if (!CAMPAIGN_LINK.test(pathname)) return null;
  const raw = pathname.match(CAMPAIGN_LINK_CODE)?.[1];
  return { code: raw ? normalizeCampaignCode(raw) : null };
}

const LANDING_PATH = /^\/(?:go|events)\//;

/**
 * Page d'arrivée ouverte depuis un lien copié sans passer par `/p/`
 * (`/go/…?utm_campaign=tt-{code}`) : le clic à mémoriser dans `tt_cmp`, ou
 * `null`.
 *
 * Rien si le cookie porte déjà ce code (arrivée depuis `/p/`, ou simple
 * rechargement) : réécrire l'horodatage prolongerait la fenêtre de 7 jours
 * sans nouveau clic. Rien non plus pour un robot.
 */
export function landingClick(input: {
  /** Chemin sans préfixe de langue. */
  pathname: string;
  searchParams: URLSearchParams;
  currentCookie: string | null | undefined;
  userAgent: string | null | undefined;
  now: Date;
}): PromotionClick | null {
  if (!LANDING_PATH.test(input.pathname)) return null;
  const code = codeFromCampaignUtm(input.searchParams.get("utm_campaign"));
  if (!code) return null;
  if (parsePromotionCookie(input.currentCookie)?.code === code) return null;
  if (isBotUserAgent(input.userAgent)) return null;
  return {
    code,
    source: sourceFromUtm(input.searchParams.get("utm_source")),
    clickAt: input.now,
  };
}
