import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/dal";
import { catalogActor } from "@/lib/admin/access";
import { sumInventory } from "@/lib/inventory";

function catalogOrderWhere(
  organizerId: string | null,
): Prisma.OrderWhereInput | undefined {
  if (!organizerId) return undefined;
  return {
    items: {
      some: { ticketType: { session: { event: { organizerId } } } },
    },
  };
}

/**
 * Requêtes du backoffice.
 *
 * Les lectures catalogue passent par `catalogActor` : un organisateur ne voit
 * que sa fiche. Les écrans plateforme (comptes, revendeurs, demandes)
 * restent derrière `requireAdmin`.
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
  const orderWhere = catalogOrderWhere(organizerId) ?? {};

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
    prisma.eventSession.findMany({
      where: sessionWhere,
      select: {
        capacity: true,
        sold: true,
        ticketTypes: {
          select: { quantity: true, sold: true, priceCents: true },
        },
      },
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
    inventory: sumInventory(inventory),
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
          capacity: true,
          sold: true,
          venue: { select: { city: true } },
          ticketTypes: {
            select: { quantity: true, sold: true, priceCents: true },
          },
        },
      },
    },
  });

  return events.map((event) => ({
    ...event,
    ...sumInventory(event.sessions),
    nextSessionAt:
      event.sessions.find((s) => s.startsAt >= new Date())?.startsAt ?? null,
  }));
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
      doorOrganizerId: true,
      _count: { select: { sessions: true, orders: true } },
    },
  });
}

export async function getOrganizerChoices() {
  await requireAdmin();

  return prisma.organizer.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

const adminOrderSelect = {
  id: true,
  reference: true,
  status: true,
  channel: true,
  paymentMethod: true,
  totalCents: true,
  currency: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  createdAt: true,
  reseller: { select: { name: true } },
  payment: {
    select: {
      provider: true,
      method: true,
      status: true,
      amountCents: true,
    },
  },
  options: { select: { title: true, summary: true, amountCents: true } },
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
              event: { select: { title: true } },
            },
          },
        },
      },
    },
  },
  tickets: {
    orderBy: { createdAt: "asc" as const },
    select: { id: true, code: true, status: true },
  },
} satisfies Prisma.OrderSelect;

export async function getAdminOrders() {
  const { organizerId } = await catalogActor();

  return prisma.order.findMany({
    where: catalogOrderWhere(organizerId),
    orderBy: { createdAt: "desc" },
    take: 100,
    select: adminOrderSelect,
  });
}

export async function getAdminOrder(id: string) {
  const { organizerId } = await catalogActor();

  const order = await prisma.order.findFirst({
    where: { id, ...catalogOrderWhere(organizerId) },
    select: adminOrderSelect,
  });
  return order;
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
