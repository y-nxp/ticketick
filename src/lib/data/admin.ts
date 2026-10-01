import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireCatalog } from "@/lib/auth/dal";
import { statsActor } from "@/lib/admin/access";
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
 * Les lectures de ventes passent par `statsActor` : un organisateur et les
 * responsables qu'il a invités ne voient que sa fiche. Les écrans plateforme
 * (comptes, revendeurs, demandes) restent derrière `requireAdmin`.
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
  const { organizerId } = await statsActor();
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
  const { organizerId } = await statsActor();

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
      organizer: { select: { name: true, slug: true } },
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

/** Page publique de l'organisateur connecté ; `null` pour l'administrateur. */
export async function getOwnOrganizerPage() {
  const { organizerId } = await statsActor();
  if (!organizerId) return null;
  return prisma.organizer.findUnique({
    where: { id: organizerId },
    select: { name: true, slug: true },
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
      doorOrganizerId: true,
      statsOrganizerId: true,
      _count: { select: { sessions: true, orders: true } },
    },
  });
}

/**
 * Responsables d'un organisateur. L'organisateur voit les siens ;
 * l'administrateur choisit l'organisateur (le premier par défaut).
 */
export async function getTeam(requestedOrganizerId?: string) {
  const user = await requireCatalog();
  const organizers =
    user.role === "ADMIN"
      ? await prisma.organizer.findMany({
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : [];
  const organizerId =
    user.role === "ORGANIZER"
      ? user.organizerId!
      : (organizers.find((o) => o.id === requestedOrganizerId) ?? organizers[0])
          ?.id;

  const viewers = organizerId
    ? await prisma.user.findMany({
        where: { role: "ORGANIZER_VIEWER", statsOrganizerId: organizerId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          email: true,
          name: true,
          lastLoginAt: true,
          passwordHash: true,
        },
      })
    : [];

  return {
    organizers,
    organizerId: organizerId ?? null,
    viewers: viewers.map(({ passwordHash, ...v }) => ({
      ...v,
      activated: passwordHash != null,
    })),
  };
}

/**
 * Encaissements de chaque organisateur : l'état de tous pour la vue
 * d'ensemble, le détail (sans les secrets) de celui qui est choisi.
 */
export async function getPaymentSettings(requestedOrganizerId?: string) {
  await requireAdmin();
  const rows = await prisma.organizer.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      bankIban: true,
      bankBeneficiary: true,
      postfinance: {
        select: { spaceId: true, userId: true, spaceViewId: true, enabled: true, updatedAt: true },
      },
      paypal: {
        select: { payeeEmail: true, clientId: true, live: true, enabled: true, updatedAt: true },
      },
    },
  });
  const organizers = rows.map((o) => ({
    id: o.id,
    name: o.name,
    card: Boolean(o.postfinance?.enabled),
    paypal: Boolean(o.paypal?.enabled),
    iban: Boolean(o.bankIban && o.bankBeneficiary),
  }));
  const selected = rows.find((o) => o.id === requestedOrganizerId) ?? rows[0];
  return {
    organizers,
    organizerId: selected?.id ?? null,
    postfinance: selected?.postfinance ?? null,
    paypal: selected?.paypal ?? null,
    bank: selected
      ? { iban: selected.bankIban ?? "", beneficiary: selected.bankBeneficiary ?? "" }
      : null,
  };
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
  discountCents: true,
  currency: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  ticketNote: true,
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
  discounts: {
    select: { amountCents: true, discount: { select: { label: true } } },
  },
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
    select: {
      id: true,
      code: true,
      status: true,
      seatLabel: true,
      attendeeName: true,
      attendeeBirthDate: true,
    },
  },
} satisfies Prisma.OrderSelect;

export async function getAdminOrders() {
  const { organizerId } = await statsActor();

  return prisma.order.findMany({
    where: catalogOrderWhere(organizerId),
    orderBy: { createdAt: "desc" },
    take: 100,
    select: adminOrderSelect,
  });
}

export async function getAdminOrder(id: string) {
  const { organizerId } = await statsActor();

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
