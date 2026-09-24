import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Hors d'un fichier « use server » : exportées de là, ces fonctions
 * deviendraient des actions appelables par n'importe qui avec un identifiant
 * et une adresse de son choix.
 */

/** Les achats faits sans compte se retrouvent dans l'espace dès l'inscription. */
export async function attachOrdersToUser(
  userId: string,
  email: string,
): Promise<void> {
  await prisma.order.updateMany({
    where: { email, userId: null },
    data: { userId },
  });
}

export async function followOrganizersFromOrders(userId: string): Promise<void> {
  const orders = await prisma.order.findMany({
    where: { userId, status: "PAID" },
    select: {
      items: {
        select: {
          ticketType: {
            select: { session: { select: { event: { select: { organizerId: true } } } } },
          },
        },
      },
    },
  });

  const ids = new Set<string>();
  for (const order of orders) {
    for (const item of order.items) {
      ids.add(item.ticketType.session.event.organizerId);
    }
  }

  for (const organizerId of ids) {
    await prisma.organizerFollow.upsert({
      where: { userId_organizerId: { userId, organizerId } },
      create: { userId, organizerId },
      update: {},
    });
  }
}

export async function getMarketingSettings(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      marketingOptIn: true,
      follows: {
        select: { organizer: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  return {
    optIn: user?.marketingOptIn ?? false,
    organizers: user?.follows.map((f) => f.organizer) ?? [],
  };
}
