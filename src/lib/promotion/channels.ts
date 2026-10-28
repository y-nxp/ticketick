import type { SocialProvider } from "@prisma/client";

/**
 * Canaux de publication de la phase 1 (docs/module-promotion.md, § 2.4) :
 * une page Facebook ou un compte Instagram professionnel. TikTok (phase 3)
 * n'est pas encore un canal.
 *
 * Sans `server-only` ni Prisma : le compositeur (navigateur), les actions
 * serveur et les tests s'en servent.
 */

export const PROMOTION_CHANNELS = ["facebook", "instagram"] as const;
export type PromotionChannel = (typeof PROMOTION_CHANNELS)[number];

const BY_PROVIDER: Partial<Record<SocialProvider, PromotionChannel>> = {
  FACEBOOK_PAGE: "facebook",
  INSTAGRAM_BUSINESS: "instagram",
};

/** Canal d'un compte connecté ; `null` pour un fournisseur pas encore pris en charge. */
export function channelOf(provider: SocialProvider): PromotionChannel | null {
  return BY_PROVIDER[provider] ?? null;
}

/** Alias court du lien (`?s=`), relu par `sourceFromLinkParam`. */
const LINK_ALIAS: Record<PromotionChannel, string> = { facebook: "fb", instagram: "ig" };

/**
 * Lien publié : `/p/{code}?s=fb&p={publication}`. L'identifiant de la
 * publication revient en `utm_content` (§ 5.1) ; avant la création, il n'est
 * pas encore connu et reste absent.
 */
export function campaignLink(
  origin: string,
  code: string,
  channel: PromotionChannel,
  postId?: string,
): string {
  const query = new URLSearchParams({ s: LINK_ALIAS[channel] });
  if (postId) query.set("p", postId);
  return `${origin.replace(/\/$/, "")}/p/${code}?${query}`;
}

/** Lien sans protocole, à recopier depuis une légende Instagram. */
export function displayLink(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

/** Instagram ne publie pas de texte seul : il lui faut une image (§ 4.1). */
export function channelNeedsImage(channel: PromotionChannel): boolean {
  return channel === "instagram";
}
