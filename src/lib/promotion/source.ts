/**
 * Source d'un clic de campagne (docs/module-promotion.md, § 5.1).
 *
 * Le lien publié porte un alias court (`/p/{code}?s=fb`) ; la base, le cookie
 * et `utm_source` n'emploient que les noms complets ci-dessous. Toute autre
 * valeur devient `link` : la liste est fermée, rien de saisi par le visiteur
 * n'arrive tel quel dans `PromotionClickDay` ni dans `Order.promotionSource`.
 */

export const PROMOTION_SOURCES = ["facebook", "instagram", "code", "link"] as const;
export type PromotionSource = (typeof PROMOTION_SOURCES)[number];

/** Source par défaut : lien sans `?s=` ou avec une valeur inconnue. */
export const DEFAULT_PROMOTION_SOURCE: PromotionSource = "link";

const LINK_ALIASES: Record<string, PromotionSource> = {
  fb: "facebook",
  ig: "instagram",
  code: "code",
};

/** `?s=` du lien `/p/{code}` → source enregistrée. */
export function sourceFromLinkParam(value: string | null | undefined): PromotionSource {
  if (!value) return DEFAULT_PROMOTION_SOURCE;
  return LINK_ALIASES[value.trim().toLowerCase()] ?? DEFAULT_PROMOTION_SOURCE;
}

export function isPromotionSource(value: string): value is PromotionSource {
  return (PROMOTION_SOURCES as readonly string[]).includes(value);
}

/**
 * `utm_source` d'une URL d'arrivée copiée sans passer par `/p/` : seules nos
 * propres valeurs sont reprises.
 */
export function sourceFromUtm(value: string | null | undefined): PromotionSource {
  const source = value?.trim().toLowerCase() ?? "";
  return isPromotionSource(source) ? source : DEFAULT_PROMOTION_SOURCE;
}

const POST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Identifiant de publication (`?p=`), repris en `utm_content`. Restreint aux
 * caractères d'un identifiant pour ne pas relayer n'importe quel texte.
 */
export function postIdFromLinkParam(value: string | null | undefined): string | null {
  const id = value?.trim() ?? "";
  return POST_ID_PATTERN.test(id) ? id : null;
}
