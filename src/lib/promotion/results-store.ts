import "server-only";

import { prisma } from "@/lib/prisma";
import {
  ACTIVE_POST_STATUSES,
  campaignDetail,
  campaignFigures,
  COUNTED_TICKET_STATUSES,
  type CampaignDetail,
  type CampaignFigures,
  type ResultCampaign,
  type ResultOrder,
  type TicketTypeOwner,
} from "./results";

/**
 * Lecture des chiffres d'une ou plusieurs campagnes, pour `results.ts`.
 * Pas de contrôle des droits ici : la page et la liste passent par
 * `statsActor()` (`src/lib/data/promotion.ts`), le rapport courriel par
 * l'organisateur qu'il concerne.
 *
 * Deux à trois requêtes quel que soit le nombre de campagnes : les commandes
 * payées par l'index `Order.promotionCampaignId`, les clics par la clé de
 * `PromotionClickDay`. Rien d'autre que `Order`, `OrderItem`, `Ticket`,
 * `OrderOption` et `PromotionClickDay`.
 */

async function paidOrders(campaignIds: string[]) {
  const rows = await prisma.order.findMany({
    where: { promotionCampaignId: { in: campaignIds }, status: "PAID" },
    select: {
      id: true,
      status: true,
      promotionCampaignId: true,
      promotionSource: true,
      createdAt: true,
      subtotalCents: true,
      discountCents: true,
      items: {
        select: {
          ticketTypeId: true,
          quantity: true,
          unitPriceCents: true,
          ticketType: {
            select: { session: { select: { eventId: true, event: { select: { organizerId: true } } } } },
          },
        },
      },
      tickets: {
        where: { status: { in: [...COUNTED_TICKET_STATUSES] } },
        select: { ticketTypeId: true },
      },
      options: {
        select: { amountCents: true, option: { select: { event: { select: { organizerId: true } } } } },
      },
    },
  });

  const owners = new Map<string, TicketTypeOwner>();
  const orders: ResultOrder[] = rows.map((o) => {
    for (const item of o.items) {
      const { session } = item.ticketType;
      owners.set(item.ticketTypeId, { eventId: session.eventId, organizerId: session.event.organizerId });
    }
    return {
      id: o.id,
      status: o.status,
      campaignId: o.promotionCampaignId!,
      source: o.promotionSource,
      createdAt: o.createdAt,
      subtotalCents: o.subtotalCents,
      discountCents: o.discountCents,
      items: o.items.map(({ ticketTypeId, quantity, unitPriceCents }) => ({
        ticketTypeId,
        quantity,
        unitPriceCents,
      })),
      tickets: o.tickets,
      options: o.options.map((x) => ({
        amountCents: x.amountCents,
        organizerId: x.option.event.organizerId,
      })),
    };
  });
  return { orders, owners };
}

/** Totaux de plusieurs campagnes (liste, rapport courriel). */
export async function loadCampaignFigures(
  campaigns: readonly ResultCampaign[],
): Promise<Map<string, CampaignFigures>> {
  if (campaigns.length === 0) return new Map();
  const ids = campaigns.map((c) => c.id);
  const [{ orders, owners }, clicks] = await Promise.all([
    paidOrders(ids),
    prisma.promotionClickDay.groupBy({
      by: ["campaignId"],
      where: { campaignId: { in: ids } },
      _sum: { clicks: true },
    }),
  ]);
  const clickTotals = new Map(clicks.map((c) => [c.campaignId, c._sum.clicks ?? 0]));
  return campaignFigures(campaigns, orders, owners, clickTotals);
}

/** Plafond du rapport courriel : au-delà, la liste de `/admin/promotion` prend le relais. */
const REPORT_CAMPAIGNS = 20;

/**
 * Campagnes actives d'un organisateur et leurs totaux, pour le rapport
 * courriel : au moins une publication publiée, en cours ou programmée
 * (`isActiveCampaign`), les plus récentes d'abord.
 */
export async function loadActiveCampaignFigures(organizerId: string) {
  const campaigns = await prisma.promotionCampaign.findMany({
    where: {
      organizerId,
      posts: { some: { status: { in: [...ACTIVE_POST_STATUSES] } } },
    },
    orderBy: { createdAt: "desc" },
    take: REPORT_CAMPAIGNS,
    select: { id: true, organizerId: true, eventId: true, name: true, event: { select: { title: true } } },
  });
  const figures = await loadCampaignFigures(campaigns);
  return campaigns.map((c) => ({ ...c, figures: figures.get(c.id)! }));
}

/** L'organisateur a-t-il au moins une campagne (case du rapport) ? */
export async function hasPromotionCampaigns(organizerId: string): Promise<boolean> {
  const one = await prisma.promotionCampaign.findFirst({ where: { organizerId }, select: { id: true } });
  return one !== null;
}

/** Détail d'une campagne : clics et ventes par jour et par source. */
export async function loadCampaignDetail(campaign: ResultCampaign): Promise<CampaignDetail> {
  const [{ orders, owners }, clicks] = await Promise.all([
    paidOrders([campaign.id]),
    prisma.promotionClickDay.groupBy({
      by: ["day", "source"],
      where: { campaignId: campaign.id },
      _sum: { clicks: true },
    }),
  ]);
  return campaignDetail(
    campaign,
    orders,
    owners,
    clicks.map((c) => ({ day: c.day, source: c.source, clicks: c._sum.clicks ?? 0 })),
  );
}
