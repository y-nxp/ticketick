import type { SalesChannel } from "@prisma/client";
import { ATTRIBUTION_WINDOW_MS, type PromotionClick } from "./cookie";

/**
 * Rattachement d'une commande à une campagne (docs/module-promotion.md,
 * § 5.2, règles 1 à 3) :
 *
 * 1. dernier clic de campagne de ce navigateur (le cookie `tt_cmp`, que
 *    chaque nouveau clic remplace), il y a moins de 7 jours ;
 * 2. canal `ONLINE` seulement : ni guichet, ni point de vente ;
 * 3. au moins un billet de l'organisateur de la campagne dans la commande.
 *
 * Le résultat est figé sur `Order` à la création (rétention comprise) et
 * jamais recalculé. Une campagne inconnue ou un cookie hors règles laisse la
 * commande sans attribution, sans erreur.
 *
 * Sans `server-only` ni Prisma : la recherche de la campagne est passée en
 * paramètre, ce qui laisse les tests tourner sans base.
 */

/** Écart d'horloge toléré entre l'instance qui a posé le cookie et celle qui le lit. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface AttributionCampaign {
  id: string;
  organizerId: string;
}

/** Les trois champs d'attribution de `Order`. */
export interface OrderAttribution {
  promotionCampaignId: string;
  promotionSource: string;
  promotionClickAt: Date;
}

export interface AttributionContext {
  click: PromotionClick | null | undefined;
  channel: SalesChannel;
  /** Organisateurs des billets de la commande. */
  organizerIds: readonly string[];
  now: Date;
}

/**
 * Règles 1 et 2, vérifiables sans la base. Faux : inutile de chercher la
 * campagne.
 */
export function mayAttribute(
  click: PromotionClick | null | undefined,
  channel: SalesChannel,
  now: Date,
): click is PromotionClick {
  if (!click || channel !== "ONLINE") return false;
  const age = now.getTime() - click.clickAt.getTime();
  return age <= ATTRIBUTION_WINDOW_MS && age >= -CLOCK_SKEW_MS;
}

/** Les trois règles, la campagne ayant été cherchée par son code. */
export function attributeOrder(
  context: AttributionContext,
  campaign: AttributionCampaign | null,
): OrderAttribution | null {
  const { click } = context;
  if (!mayAttribute(click, context.channel, context.now)) return null;
  if (!campaign) return null;
  if (!context.organizerIds.includes(campaign.organizerId)) return null;
  return {
    promotionCampaignId: campaign.id,
    promotionSource: click.source,
    promotionClickAt: click.clickAt,
  };
}

/**
 * Attribution d'une commande. Sans cookie (le cas courant), hors canal en
 * ligne ou hors fenêtre : aucune requête. Sinon une seule lecture, par code.
 * Une panne de cette lecture n'empêche pas la commande : elle reste
 * simplement sans attribution.
 */
export async function resolveOrderAttribution(
  context: AttributionContext,
  findCampaign: (code: string) => Promise<AttributionCampaign | null>,
): Promise<OrderAttribution | null> {
  if (!mayAttribute(context.click, context.channel, context.now)) return null;
  let campaign: AttributionCampaign | null;
  try {
    campaign = await findCampaign(context.click.code);
  } catch (error) {
    console.error("[promotion] lecture de la campagne", error);
    return null;
  }
  return attributeOrder(context, campaign);
}

/**
 * Champs à ajouter aux données de `order.create` : rien du tout sans
 * attribution, pour que la commande soit écrite exactement comme avant.
 */
export function promotionOrderFields(
  attribution: OrderAttribution | null,
): OrderAttribution | Record<string, never> {
  return attribution ?? {};
}
