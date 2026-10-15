import "server-only";

import { prisma } from "@/lib/prisma";
import { eventRulesSelect } from "@/lib/orders/change-access";
import { cancelOpen, changeOpen } from "@/lib/orders/self-service-rules";

/**
 * Commandes et billets de la personne connectée.
 *
 * L'identifiant vient de la session, jamais de la requête : accepter un
 * `userId` en paramètre depuis l'extérieur laisserait consulter les commandes
 * d'autrui.
 */
export async function getMyOrders(userId: string) {
  return prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      reference: true,
      status: true,
      totalCents: true,
      currency: true,
      createdAt: true,
      options: {
        select: {
          title: true,
          summary: true,
          amountCents: true,
          quantity: true,
        },
      },
      items: {
        select: {
          ticketTypeId: true,
          quantity: true,
          unitPriceCents: true,
          ticketType: {
            select: {
              name: true,
              session: {
                select: {
                  startsAt: true,
                  venue: { select: { name: true, city: true } },
                  event: { select: { slug: true, title: true } },
                },
              },
            },
          },
        },
      },
      // Les billets n'existent qu'une fois le paiement confirmé : une commande
      // en attente de virement n'en a pas encore.
      tickets: {
        select: {
          code: true,
          status: true,
          ticketTypeId: true,
          ticketType: {
            select: {
              session: { select: { startsAt: true, event: { select: eventRulesSelect } } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      resellerId: true,
    },
  });
}

export type MyOrder = Awaited<ReturnType<typeof getMyOrders>>[number];

/** Commande que le client peut gérer depuis son compte : changement ou annulation. */
export function selfServiceOpen(order: MyOrder): boolean {
  if (order.status !== "PAID" || order.resellerId) return false;
  const paidOf = new Map(order.items.map((i) => [i.ticketTypeId, i.unitPriceCents]));
  return order.tickets.some((ticket) => {
    if (ticket.status !== "VALID") return false;
    const { startsAt, event } = ticket.ticketType.session;
    return (
      changeOpen({ startsAt, event, viaAccount: true }) ||
      cancelOpen({ startsAt, event, paidCents: paidOf.get(ticket.ticketTypeId) ?? 0 })
    );
  });
}
