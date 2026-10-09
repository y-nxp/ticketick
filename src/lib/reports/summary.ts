import "server-only";

import { prisma } from "@/lib/prisma";
import { HOLD_PLACEHOLDER_DOMAIN } from "@/lib/orders/create-order";
import { readLayout } from "@/lib/seating/layout";

/**
 * Rapport d'un organisateur, séance par séance, pour les dates à venir :
 * ventes, invitations et places restantes.
 *
 * Une invitation est une commande du guichet sans point de vente : c'est
 * ainsi que l'admin enregistre les invités, offerts ou payés hors billetterie.
 * Les ventes sont les billets payés en ligne ou par un point de vente.
 */

export const REPORT_SECTIONS = ["sales", "invitations", "remaining"] as const;
export type ReportSection = (typeof REPORT_SECTIONS)[number];

export function readSections(raw: readonly string[]): ReportSection[] {
  const list = REPORT_SECTIONS.filter((s) => raw.includes(s));
  return list.length > 0 ? list : [...REPORT_SECTIONS];
}

export interface InvitationReservation {
  orderId: string;
  reference: string;
  name: string;
  note: string | null;
  email: string;
  places: number;
  /** `RESERVATION` : offerte ; sinon le moyen de règlement. */
  paymentMethod: string;
  paidCents: number;
  /** Lien de paiement envoyé, pas encore réglé. */
  awaitingPayment: boolean;
  createdAt: Date;
}

export interface ReportFigures {
  /** Billets payés en ligne ou par un point de vente. */
  sold: number;
  /** Dont émis depuis `since`. */
  soldNew: number;
  /** Encaissé pour ces billets, rabais de la commande déduits. */
  revenueCents: number;
  revenueResellerCents: number;
  /** Places retenues par une commande dont le paiement est attendu (virement). */
  pending: number;
  /** Places invités encore libres (sièges bloqués ou places hors jauge). */
  guestHeld: number;
  offered: number;
  paid: number;
  paidCents: number;
  onSale: number;
}

export interface ReportSession extends ReportFigures {
  sessionId: string;
  eventId: string;
  eventTitle: unknown;
  startsAt: Date;
  venue: string | null;
  seated: boolean;
  reservations: InvitationReservation[];
}

const EMPTY: ReportFigures = {
  sold: 0,
  soldNew: 0,
  revenueCents: 0,
  revenueResellerCents: 0,
  pending: 0,
  guestHeld: 0,
  offered: 0,
  paid: 0,
  paidCents: 0,
  onSale: 0,
};

export async function getOrganizerReport(
  organizerId: string,
  options: { since: Date; now?: Date },
): Promise<{ sessions: ReportSession[]; totals: ReportFigures }> {
  const now = options.now ?? new Date();
  const sessions = await prisma.eventSession.findMany({
    where: {
      startsAt: { gte: new Date(now.getTime() - 12 * 60 * 60 * 1000) },
      status: { not: "CANCELLED" },
      event: { organizerId, status: { not: "CANCELLED" } },
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      capacity: true,
      sold: true,
      inviteSeats: true,
      seatPlanId: true,
      venue: { select: { name: true, city: true } },
      event: { select: { id: true, title: true } },
      ticketTypes: { select: { id: true, quantity: true, sold: true } },
    },
  });
  const ids = sessions.map((s) => s.id);
  const sessionOfType = new Map(
    sessions.flatMap((s) => s.ticketTypes.map((tt) => [tt.id, s.id] as const)),
  );
  const ofSession = { ticketType: { sessionId: { in: ids } } };

  const planIds = [...new Set(sessions.map((s) => s.seatPlanId).filter((id): id is string => !!id))];
  const [plans, seatCounts, reservationTickets, soldTickets, pendingItems] = await Promise.all([
    prisma.seatPlan.findMany({ where: { id: { in: planIds } }, select: { id: true, layout: true } }),
    prisma.sessionSeat.groupBy({
      by: ["sessionId", "status"],
      where: { sessionId: { in: ids } },
      _count: true,
    }),
    prisma.ticket.findMany({
      where: {
        ...ofSession,
        status: { in: ["VALID", "USED", "PENDING"] },
        order: {
          channel: "BOX_OFFICE",
          resellerId: null,
          status: { in: ["PAID", "AWAITING_PAYMENT"] },
        },
      },
      select: {
        ticketTypeId: true,
        order: {
          select: {
            id: true,
            reference: true,
            firstName: true,
            lastName: true,
            ticketNote: true,
            email: true,
            paymentMethod: true,
            totalCents: true,
            createdAt: true,
            charges: { where: { kind: "PAYMENT", status: "OPEN" }, select: { id: true } },
          },
        },
      },
    }),
    prisma.ticket.findMany({
      where: {
        ...ofSession,
        status: { in: ["VALID", "USED"] },
        order: { status: "PAID", channel: { not: "BOX_OFFICE" } },
      },
      select: {
        ticketTypeId: true,
        createdAt: true,
        order: {
          select: {
            channel: true,
            subtotalCents: true,
            discountCents: true,
            items: { select: { ticketTypeId: true, unitPriceCents: true } },
          },
        },
      },
    }),
    prisma.orderItem.findMany({
      where: {
        ...ofSession,
        order: {
          status: "AWAITING_PAYMENT",
          channel: { not: "BOX_OFFICE" },
          NOT: { email: { endsWith: `@${HOLD_PLACEHOLDER_DOMAIN}` } },
        },
      },
      select: { ticketTypeId: true, quantity: true },
    }),
  ]);

  const figures = new Map<string, ReportFigures>(ids.map((id) => [id, { ...EMPTY }]));
  const of = (ticketTypeId: string) => {
    const id = sessionOfType.get(ticketTypeId);
    return id ? figures.get(id) : undefined;
  };

  for (const ticket of soldTickets) {
    const f = of(ticket.ticketTypeId);
    if (!f) continue;
    const o = ticket.order;
    const unit = o.items.find((i) => i.ticketTypeId === ticket.ticketTypeId)?.unitPriceCents ?? 0;
    const share = o.subtotalCents > 0 ? 1 - o.discountCents / o.subtotalCents : 1;
    const cents = Math.round(unit * share);
    f.sold += 1;
    f.revenueCents += cents;
    if (o.channel === "RESELLER") f.revenueResellerCents += cents;
    if (ticket.createdAt > options.since) f.soldNew += 1;
  }
  for (const item of pendingItems) {
    const f = of(item.ticketTypeId);
    if (f) f.pending += item.quantity;
  }

  const reservations = new Map<string, Map<string, InvitationReservation>>();
  for (const ticket of reservationTickets) {
    const sessionId = sessionOfType.get(ticket.ticketTypeId);
    if (!sessionId) continue;
    const bySession = reservations.get(sessionId) ?? new Map<string, InvitationReservation>();
    const o = ticket.order;
    const existing = bySession.get(o.id);
    if (existing) {
      existing.places += 1;
    } else {
      bySession.set(o.id, {
        orderId: o.id,
        reference: o.reference,
        name: `${o.firstName} ${o.lastName}`.trim(),
        note: o.ticketNote,
        email: o.email,
        places: 1,
        paymentMethod: o.paymentMethod ?? "RESERVATION",
        paidCents: o.totalCents,
        awaitingPayment: o.charges.length > 0,
        createdAt: o.createdAt,
      });
    }
    reservations.set(sessionId, bySession);
  }

  const seatsInPlan = new Map(plans.map((p) => [p.id, readLayout(p.layout)?.seats.length ?? 0]));
  const seatStatus = new Map<string, Record<string, number>>();
  for (const row of seatCounts) {
    const counts = seatStatus.get(row.sessionId) ?? {};
    counts[row.status] = row._count;
    seatStatus.set(row.sessionId, counts);
  }

  const rows: ReportSession[] = sessions.map((s) => {
    const f = figures.get(s.id)!;
    const seats = seatStatus.get(s.id) ?? {};
    const seated = s.seatPlanId != null && seatsInPlan.has(s.seatPlanId);
    const list = [...(reservations.get(s.id)?.values() ?? [])].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const offered = list.filter((r) => r.paymentMethod === "RESERVATION");
    const paid = list.filter((r) => r.paymentMethod !== "RESERVATION");
    return {
      ...f,
      sessionId: s.id,
      eventId: s.event.id,
      eventTitle: s.event.title,
      startsAt: s.startsAt,
      venue: s.venue ? `${s.venue.name}, ${s.venue.city}` : null,
      seated,
      guestHeld: seated ? (seats.BLOCKED ?? 0) : s.inviteSeats,
      offered: offered.reduce((n, r) => n + r.places, 0),
      paid: paid.reduce((n, r) => n + r.places, 0),
      paidCents: paid.reduce((n, r) => n + r.paidCents, 0),
      onSale: seated
        ? Math.max(0, seatsInPlan.get(s.seatPlanId!)! - (seats.RESERVED ?? 0) - (seats.BLOCKED ?? 0))
        : s.capacity != null
          ? Math.max(0, s.capacity - s.sold)
          : s.ticketTypes.reduce((n, tt) => n + Math.max(0, tt.quantity - tt.sold), 0),
      reservations: list,
    };
  });

  const totals = rows.reduce<ReportFigures>((acc, r) => {
    const out = { ...acc };
    for (const key of Object.keys(EMPTY) as (keyof ReportFigures)[]) out[key] += r[key];
    return out;
  }, { ...EMPTY });
  return { sessions: rows, totals };
}
