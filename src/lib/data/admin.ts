import "server-only";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/dal";
import { catalogActor } from "@/lib/admin/access";

/**
 * Requêtes du backoffice.
 *
 * Chaque fonction appelle `requireAdmin` avant de toucher la base. Le contrôle
 * est ainsi porté par l'accès à la donnée lui-même : une page ajoutée plus
 * tard ne peut pas lire ces chiffres en oubliant de se protéger.
 */

export interface AdminOverview {
  events: { total: number; published: number; draft: number };
  sessions: { total: number; upcoming: number };
  inventory: { capacity: number; sold: number; revenueCents: number };
  orders: { total: number; paidCents: number };
  users: { total: number; admins: number };
  resellers: { total: number; balanceCents: number };
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const { organizerId } = await catalogActor();
  const eventWhere = organizerId ? { organizerId } : {};
  const sessionWhere = organizerId
    ? { event: { organizerId } }
    : {};
  const typeWhere = organizerId
    ? { session: { event: { organizerId } } }
    : {};
  const orderWhere = organizerId
    ? {
        tickets: {
          some: { ticketType: { session: { event: { organizerId } } } },
        },
      }
    : {};

  const now = new Date();

  const [
    eventsTotal,
    eventsPublished,
    sessionsTotal,
    sessionsUpcoming,
    inventory,
    ordersTotal,
    paidOrders,
    usersTotal,
    admins,
    resellersTotal,
    ledger,
  ] = await Promise.all([
    prisma.event.count({ where: eventWhere }),
    prisma.event.count({ where: { ...eventWhere, status: "PUBLISHED" } }),
    prisma.eventSession.count({ where: sessionWhere }),
    prisma.eventSession.count({
      where: { ...sessionWhere, startsAt: { gte: now } },
    }),
    prisma.ticketType.findMany({
      where: typeWhere,
      select: { quantity: true, sold: true, priceCents: true },
    }),
    prisma.order.count({ where: orderWhere }),
    prisma.order.aggregate({
      where: { ...orderWhere, status: "PAID" },
      _sum: { totalCents: true },
    }),
    organizerId ? Promise.resolve(0) : prisma.user.count(),
    organizerId ? Promise.resolve(0) : prisma.user.count({ where: { role: "ADMIN" } }),
    organizerId ? Promise.resolve(0) : prisma.reseller.count(),
    organizerId
      ? Promise.resolve({ _sum: { amountCents: 0 } })
      : prisma.resellerLedgerEntry.aggregate({ _sum: { amountCents: true } }),
  ]);

  return {
    events: {
      total: eventsTotal,
      published: eventsPublished,
      draft: eventsTotal - eventsPublished,
    },
    sessions: { total: sessionsTotal, upcoming: sessionsUpcoming },
    inventory: {
      capacity: inventory.reduce((sum, tt) => sum + tt.quantity, 0),
      sold: inventory.reduce((sum, tt) => sum + tt.sold, 0),
      revenueCents: inventory.reduce(
        (sum, tt) => sum + tt.sold * tt.priceCents,
        0,
      ),
    },
    orders: { total: ordersTotal, paidCents: paidOrders._sum.totalCents ?? 0 },
    users: { total: usersTotal, admins },
    resellers: {
      total: resellersTotal,
      balanceCents: ledger._sum.amountCents ?? 0,
    },
  };
}

export async function getAdminEvents() {
  const { organizerId } = await catalogActor();

  const events = await prisma.event.findMany({
    where: organizerId ? { organizerId } : undefined,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      visibility: true,
      featured: true,
      organizer: { select: { name: true } },
      sessions: {
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          startsAt: true,
          venue: { select: { city: true } },
          ticketTypes: {
            select: { quantity: true, sold: true, priceCents: true },
          },
        },
      },
    },
  });

  return events.map((event) => {
    const ticketTypes = event.sessions.flatMap((s) => s.ticketTypes);
    return {
      ...event,
      capacity: ticketTypes.reduce((sum, tt) => sum + tt.quantity, 0),
      sold: ticketTypes.reduce((sum, tt) => sum + tt.sold, 0),
      revenueCents: ticketTypes.reduce(
        (sum, tt) => sum + tt.sold * tt.priceCents,
        0,
      ),
      nextSessionAt:
        event.sessions.find((s) => s.startsAt >= new Date())?.startsAt ?? null,
    };
  });
}

export async function getAdminUsers() {
  await requireAdmin();

  return prisma.user.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      lastLoginAt: true,
      createdAt: true,
      organizer: { select: { id: true, name: true } },
      _count: { select: { sessions: true, orders: true } },
    },
  });
}

export async function getAdminOrders() {
  const { organizerId } = await catalogActor();

  return prisma.order.findMany({
    where: organizerId
      ? {
          tickets: {
            some: { ticketType: { session: { event: { organizerId } } } },
          },
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      reference: true,
      status: true,
      channel: true,
      totalCents: true,
      currency: true,
      email: true,
      createdAt: true,
      reseller: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });
}

export async function getAdminResellers() {
  await requireAdmin();

  const resellers = await prisma.reseller.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      type: true,
      active: true,
      commissionBps: true,
      allowCashSales: true,
      ledger: { select: { amountCents: true } },
      _count: { select: { agents: true, orders: true } },
    },
  });

  return resellers.map(({ ledger, ...reseller }) => ({
    ...reseller,
    // Les écritures sont signées du point de vue du revendeur : leur somme
    // donne le solde sans avoir à distinguer les types d'entrées. Positif,
    // ticketick lui doit ; négatif, il doit à ticketick.
    balanceCents: ledger.reduce((sum, e) => sum + e.amountCents, 0),
  }));
}

export async function getAdminInquiries() {
  await requireAdmin();

  return prisma.organizerInquiry.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}
