import { normalizeCampaignCode } from "./campaign-code";
import { isPromotionSource, type PromotionSource } from "./source";

/**
 * Cookie première partie `tt_cmp` : le dernier clic de campagne de ce
 * navigateur (docs/module-promotion.md, §§ 5.1 et 5.5).
 *
 * Contenu : code de campagne, source, instant du clic, rien d'autre — ni
 * identifiant de personne ni donnée personnelle. Forme compacte
 * `{code}.{source}.{millisecondes}`, sans caractère à échapper.
 *
 * Non signé : un cookie forgé ne donne qu'une attribution fausse, aucun
 * avantage. La fenêtre de 7 jours est revérifiée à la commande sur
 * l'horodatage, pas seulement confiée au `Max-Age`.
 *
 * Sans `server-only` ni Prisma : le proxy et les tests s'en servent.
 */

export const PROMOTION_COOKIE = "tt_cmp";

/** Fenêtre d'attribution (§ 5.2, valeur à confirmer). */
export const ATTRIBUTION_WINDOW_DAYS = 7;
export const ATTRIBUTION_WINDOW_MS = ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * Lu par le serveur seulement (`HttpOnly`), à la différence de
 * `rememberShopOrigin`, écrit côté client.
 */
export const PROMOTION_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax",
  httpOnly: true,
  maxAge: ATTRIBUTION_WINDOW_MS / 1000,
} as const;

export interface PromotionClick {
  code: string;
  source: PromotionSource;
  clickAt: Date;
}

export function serializePromotionCookie(click: PromotionClick): string {
  return `${click.code}.${click.source}.${click.clickAt.getTime()}`;
}

/**
 * Cookie lu tel quel. `null` s'il est absent ou illisible : la commande n'est
 * alors simplement pas attribuée, sans erreur.
 */
export function parsePromotionCookie(value: string | null | undefined): PromotionClick | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [rawCode, source, rawTime] = parts as [string, string, string];
  const code = normalizeCampaignCode(rawCode);
  if (!code || !isPromotionSource(source)) return null;
  if (!/^\d{1,15}$/.test(rawTime)) return null;
  const clickAt = new Date(Number(rawTime));
  if (Number.isNaN(clickAt.getTime())) return null;
  return { code, source, clickAt };
}
