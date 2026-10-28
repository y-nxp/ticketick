import { randomInt } from "node:crypto";

/**
 * Code de campagne : `/p/{code}` et `utm_campaign=tt-{code}`.
 *
 * Imprévisible, pour qu'on ne puisse ni parcourir les campagnes des autres
 * organisateurs ni s'attribuer des ventes en fabriquant un lien. Court et
 * sans caractère ambigu (ni 0/o, ni 1/l/i), parce qu'il se recopie à la main
 * depuis une légende Instagram. En minuscules : c'est un bout d'URL.
 *
 * 8 caractères parmi 31 : environ 8,5 × 10¹¹ codes (~40 bits).
 *
 * Sans `server-only` ni Prisma : le proxy (format seul) et les tests s'en
 * servent aussi.
 */

export const CAMPAIGN_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const CAMPAIGN_CODE_LENGTH = 8;
/** Préfixe de `utm_campaign`, qui distingue nos campagnes de celles de l'organisateur. */
export const CAMPAIGN_UTM_PREFIX = "tt-";

const CODE_PATTERN = new RegExp(`^[${CAMPAIGN_CODE_ALPHABET}]{${CAMPAIGN_CODE_LENGTH}}$`);

/** Nouveau code, tiré au hasard sans biais (`randomInt`). Unicité non vérifiée. */
export function generateCampaignCode(): string {
  let out = "";
  for (let i = 0; i < CAMPAIGN_CODE_LENGTH; i++) {
    out += CAMPAIGN_CODE_ALPHABET[randomInt(CAMPAIGN_CODE_ALPHABET.length)];
  }
  return out;
}

/** Format valide (ne dit rien de son existence en base). */
export function isCampaignCode(value: string): boolean {
  return CODE_PATTERN.test(value);
}

/**
 * Code saisi ou lu dans une URL : espaces retirés, minuscules. `null` si le
 * format ne convient pas.
 */
export function normalizeCampaignCode(value: string): string | null {
  const code = value.trim().toLowerCase();
  return isCampaignCode(code) ? code : null;
}

/** Valeur de `utm_campaign` pour ce code : `tt-{code}`. */
export function campaignUtm(code: string): string {
  return `${CAMPAIGN_UTM_PREFIX}${code}`;
}

/** Code porté par un `utm_campaign=tt-{code}`, `null` sinon. */
export function codeFromCampaignUtm(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed.startsWith(CAMPAIGN_UTM_PREFIX)) return null;
  return normalizeCampaignCode(trimmed.slice(CAMPAIGN_UTM_PREFIX.length));
}

/** Ce qu'il faut du client Prisma (ou d'une transaction) pour vérifier un code. */
export interface CampaignCodeStore {
  promotionCampaign: {
    findUnique(args: { where: { code: string }; select: { id: true } }): Promise<{ id: string } | null>;
  };
}

const MAX_ATTEMPTS = 5;

/**
 * Code libre en base. Une collision est déjà improbable ; on retire au plus
 * cinq fois avant d'abandonner. La contrainte d'unicité sur
 * `PromotionCampaign.code` reste le dernier rempart entre la vérification et
 * l'insertion.
 */
export async function freeCampaignCode(
  db: CampaignCodeStore,
  generate: () => string = generateCampaignCode,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = generate();
    const taken = await db.promotionCampaign.findUnique({ where: { code }, select: { id: true } });
    if (!taken) return code;
  }
  throw new Error("aucun code de campagne libre");
}
