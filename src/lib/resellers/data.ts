import "server-only";

import { notFound } from "next/navigation";
import { catalogActor } from "@/lib/admin/access";
import type { CurrentUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { readLayout } from "@/lib/seating/layout";
import { syncSessionSeats } from "@/lib/seating/seats";
import { ticketPdfPath } from "@/lib/tickets/download";
import { commissionRule } from "./commission";
import { resellerStats } from "./stats";

/** Agent connecté : `requireResellerAgent` a déjà vérifié le point de vente. */
type Agent = CurrentUser & { resellerId: string };

// ─────────────────────────────── Gestion (admin, organisateur)

function managedWhere(organizerId: string | null) {
  return organizerId ? { organizerId } : {};
}

export async function getManagedResellers() {
  const { organizerId } = await catalogActor();
  const resellers = await prisma.reseller.findMany({
    where: managedWhere(organizerId),
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      type: true,
      city: true,
      active: true,
      commissionKind: true,
      commissionBps: true,
      commissionFixedCents: true,
      organizer: { select: { name: true } },
      _count: { select: { agents: true, events: true } },
    },
  });
  const stats = await Promise.all(resellers.map((r) => resellerStats(r.id)));
  return {
    admin: organizerId == null,
    resellers: resellers.map((r, i) => ({
      ...r,
      rule: commissionRule(r),
      totals: stats[i]!.totals,
      balanceCents: stats[i]!.balanceCents,
    })),
  };
}

export async function getManagedReseller(id: string) {
  const { organizerId } = await catalogActor();
  const reseller = await prisma.reseller.findFirst({
    where: { id, ...managedWhere(organizerId) },
    select: {
      id: true,
      name: true,
      type: true,
      email: true,
      phone: true,
      address: true,
      city: true,
      locale: true,
      organizerId: true,
      organizer: { select: { name: true } },
      commissionKind: true,
      commissionBps: true,
      commissionFixedCents: true,
      allowCashSales: true,
      allowTerminalSales: true,
      allowOnlineSales: true,
      notifyEmails: true,
      reportFrequency: true,
      reportCopyOrganizer: true,
      lastReportAt: true,
      active: true,
      agents: {
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true, name: true, passwordHash: true, lastLoginAt: true },
      },
    },
  });
  if (!reseller) notFound();

  const stats = await resellerStats(reseller.id);
  const owner = reseller.organizerId ?? organizerId;
  const assigned = new Set(stats.events.map((e) => e.eventId));
  const assignable = await prisma.event.findMany({
    where: {
      ...(owner ? { organizerId: owner } : {}),
      status: { notIn: ["CANCELLED", "PAST"] },
      id: { notIn: [...assigned] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, status: true, organizer: { select: { name: true } } },
    take: 200,
  });
  const organizers =
    organizerId == null
      ? await prisma.organizer.findMany({
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : [];

  const { agents, ...rest } = reseller;
  return {
    admin: organizerId == null,
    reseller: {
      ...rest,
      agents: agents.map(({ passwordHash, ...a }) => ({ ...a, activated: passwordHash != null })),
    },
    stats,
    assignable,
    organizers,
  };
}

// ─────────────────────────────── Espace du point de vente

export async function getPosHome(agent: Agent) {
  const reseller = await prisma.reseller.findUniqueOrThrow({
    where: { id: agent.resellerId },
    select: {
      id: true,
      name: true,
      allowCashSales: true,
      allowTerminalSales: true,
      allowOnlineSales: true,
    },
  });
  return { reseller, stats: await resellerStats(reseller.id) };
}

/** Séances à venir des spectacles attribués, ouvertes à la vente. */
export async function getPosShows(agent: Agent) {
  const now = new Date();
  const assignments = await prisma.resellerEvent.findMany({
    where: {
      resellerId: agent.resellerId,
      event: { status: { in: ["PUBLISHED", "SOLD_OUT"] } },
    },
    select: {
      event: {
        select: {
          id: true,
          title: true,
          coverImage: true,
          organizer: { select: { name: true } },
          sessions: {
            where: { startsAt: { gt: now }, status: { in: ["PUBLISHED", "SOLD_OUT"] } },
            orderBy: { startsAt: "asc" },
            select: {
              id: true,
              startsAt: true,
              label: true,
              venue: { select: { name: true, city: true } },
            },
          },
        },
      },
    },
  });
  return assignments
    .map((a) => a.event)
    .filter((e) => e.sessions.length > 0)
    .sort((a, b) => a.sessions[0]!.startsAt.getTime() - b.sessions[0]!.startsAt.getTime());
}

export async function getPosSession(agent: Agent, sessionId: string) {
  const session = await prisma.eventSession.findFirst({
    where: {
      id: sessionId,
      status: { in: ["PUBLISHED", "SOLD_OUT"] },
      event: {
        status: { in: ["PUBLISHED", "SOLD_OUT"] },
        resellers: { some: { resellerId: agent.resellerId } },
      },
    },
    select: {
      id: true,
      startsAt: true,
      label: true,
      capacity: true,
      sold: true,
      seatPlan: { select: { layout: true } },
      venue: { select: { name: true, city: true } },
      event: {
        select: {
          id: true,
          title: true,
          organizerId: true,
          organizer: { select: { name: true } },
        },
      },
      ticketTypes: {
        orderBy: { priceCents: "desc" },
        select: {
          id: true,
          name: true,
          priceCents: true,
          quantity: true,
          sold: true,
          seatZones: true,
          maxPerPaidTicket: true,
          requiresAttendee: true,
          maxAgeYears: true,
          salesStartAt: true,
          salesEndAt: true,
        },
      },
    },
  });
  if (!session) return null;

  const layout = readLayout(session.seatPlan?.layout);
  let freeByZone: Record<string, number> | null = null;
  if (layout) {
    await syncSessionSeats(session.id);
    const rows = await prisma.sessionSeat.groupBy({
      by: ["zone"],
      where: { sessionId: session.id, status: "AVAILABLE" },
      _count: { _all: true },
    });
    freeByZone = Object.fromEntries(rows.map((r) => [r.zone, r._count._all]));
  }
  const now = new Date();
  const roomLeft = session.capacity == null ? Infinity : Math.max(0, session.capacity - session.sold);
  const allZones = layout?.zones.map((z) => z.key) ?? [];
  const types = session.ticketTypes
    .filter((tt) => !(tt.salesStartAt && tt.salesStartAt > now) && !(tt.salesEndAt && tt.salesEndAt < now))
    .map((tt) => {
      let available = Math.min(Math.max(0, tt.quantity - tt.sold), roomLeft);
      if (freeByZone) {
        const keys = tt.seatZones.length ? tt.seatZones : allZones;
        available = Math.min(available, keys.reduce((n, k) => n + (freeByZone[k] ?? 0), 0));
      }
      return { ...tt, available };
    });
  return { session, types, seated: layout != null };
}

export async function getPosSales(agent: Agent, page: number) {
  const take = 50;
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where: { resellerId: agent.resellerId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
      select: saleSelect,
    }),
    prisma.order.count({ where: { resellerId: agent.resellerId } }),
  ]);
  return { sales: orders.map(toSale), pages: Math.max(1, Math.ceil(total / take)) };
}

export async function getPosSale(agent: Agent, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, resellerId: agent.resellerId },
    select: {
      ...saleSelect,
      email: true,
      phone: true,
      tickets: {
        orderBy: { createdAt: "asc" },
        select: {
          code: true,
          status: true,
          seatLabel: true,
          attendeeName: true,
          ticketType: { select: { name: true, priceCents: true } },
        },
      },
    },
  });
  if (!order) return null;
  const sale = toSale(order);
  return {
    ...sale,
    email: order.email,
    phone: order.phone,
    tickets: order.tickets,
    pdfUrl: sale.state === "paid" ? ticketPdfPath(order.reference) : null,
  };
}

const saleSelect = {
  id: true,
  reference: true,
  status: true,
  createdAt: true,
  firstName: true,
  lastName: true,
  totalCents: true,
  commissionCents: true,
  soldBy: { select: { name: true, email: true } },
  charges: {
    where: { kind: "PAYMENT" as const },
    orderBy: { createdAt: "asc" as const },
    select: { method: true, status: true, amountCents: true },
  },
  items: {
    select: {
      quantity: true,
      ticketType: {
        select: {
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
};

type SaleRow = {
  id: string;
  reference: string;
  status: string;
  createdAt: Date;
  firstName: string;
  lastName: string;
  totalCents: number;
  commissionCents: number;
  soldBy: { name: string | null; email: string } | null;
  charges: { method: string; status: string; amountCents: number }[];
  items: {
    quantity: number;
    ticketType: { session: { startsAt: Date; event: { title: unknown } } };
  }[];
};

function toSale(order: SaleRow) {
  const charge = order.charges[0];
  const state: "paid" | "pending" | "expired" | "cancelled" =
    order.status === "CANCELLED" || order.status === "REFUNDED"
      ? "cancelled"
      : !charge || charge.status === "DONE"
        ? "paid"
        : charge.status === "OPEN"
          ? "pending"
          : "expired";
  const session = order.items[0]?.ticketType.session;
  return {
    id: order.id,
    reference: order.reference,
    createdAt: order.createdAt,
    holder: `${order.firstName} ${order.lastName}`.trim(),
    seller: order.soldBy?.name ?? order.soldBy?.email ?? null,
    tickets: order.items.reduce((n, i) => n + i.quantity, 0),
    amountCents: charge?.amountCents ?? 0,
    commissionCents: state === "paid" ? order.commissionCents : 0,
    method: charge?.method ?? "FREE",
    state,
    eventTitle: session?.event.title ?? null,
    startsAt: session?.startsAt ?? null,
  };
}
