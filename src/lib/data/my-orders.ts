import "server-only";

import { prisma } from "@/lib/prisma";

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
      items: {
        select: {
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
        select: { code: true, status: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export type MyOrder = Awaited<ReturnType<typeof getMyOrders>>[number];
