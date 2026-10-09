import "server-only";

import { prisma } from "@/lib/prisma";
import { readLayout } from "@/lib/seating/layout";

/**
 * Invitations d'un organisateur, séance par séance : places mises de côté
 * pour les invités et encore libres, réservations saisies à l'admin (offertes
 * ou payées hors billetterie), et places restant en vente.
 *
 * Une réservation est une commande du guichet sans point de vente : c'est
 * ainsi que l'admin enregistre les invités, qu'elle soit prise sur les places
 * invités ou sur la vente.
 */

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

export interface InvitationSession {
  sessionId: string;
  eventId: string;
  eventTitle: unknown;
  startsAt: Date;
  venue: string | null;
  seated: boolean;
  /** Places invités encore libres (sièges bloqués ou places hors jauge). */
  guestHeld: number;
  offered: number;
  paid: number;
  paidCents: number;
  /** Billets vendus en ligne ou par un point de vente. */
  sold: number;
  onSale: number;
  reservations: InvitationReservation[];
}

export interface InvitationTotals {
  guestHeld: number;
  offered: number;
  paid: number;
  paidCents: number;
  sold: number;
  onSale: number;
}

export async function getInvitationSummary(
  organizerId: string,
  now = new Date(),
): Promise<{ sessions: InvitationSession[]; totals: InvitationTotals }> {
  const since = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  const sessions = await prisma.eventSession.findMany({
    where: {
      startsAt: { gte: since },
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

  const planIds = [...new Set(sessions.map((s) => s.seatPlanId).filter((id): id is string => !!id))];
  const [plans, seatCounts, reservationTickets, soldByType] = await Promise.all([
    prisma.seatPlan.findMany({ where: { id: { in: planIds } }, select: { id: true, layout: true } }),
    prisma.sessionSeat.groupBy({
      by: ["sessionId", "status"],
      where: { sessionId: { in: ids } },
      _count: true,
    }),
    prisma.ticket.findMany({
      where: {
        ticketType: { sessionId: { in: ids } },
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
            charges: {
              where: { kind: "PAYMENT", status: "OPEN" },
              select: { id: true },
            },
          },
        },
      },
    }),
    prisma.ticket.groupBy({
      by: ["ticketTypeId"],
      where: {
        ticketType: { sessionId: { in: ids } },
        status: { in: ["VALID", "USED"] },
        order: { status: "PAID", channel: { not: "BOX_OFFICE" } },
      },
      _count: true,
    }),
  ]);

  const seatsInPlan = new Map(plans.map((p) => [p.id, readLayout(p.layout)?.seats.length ?? 0]));
  const seatStatus = new Map<string, Record<string, number>>();
  for (const row of seatCounts) {
    const counts = seatStatus.get(row.sessionId) ?? {};
    counts[row.status] = row._count;
    seatStatus.set(row.sessionId, counts);
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

  const soldBySession = new Map<string, number>();
  for (const row of soldByType) {
    const sessionId = sessionOfType.get(row.ticketTypeId);
    if (sessionId) soldBySession.set(sessionId, (soldBySession.get(sessionId) ?? 0) + row._count);
  }

  const rows: InvitationSession[] = sessions.map((s) => {
    const seats = seatStatus.get(s.id) ?? {};
    const seated = s.seatPlanId != null && seatsInPlan.has(s.seatPlanId);
    const guestHeld = seated ? (seats.BLOCKED ?? 0) : s.inviteSeats;
    const onSale = seated
      ? Math.max(0, seatsInPlan.get(s.seatPlanId!)! - (seats.RESERVED ?? 0) - (seats.BLOCKED ?? 0))
      : s.capacity != null
        ? Math.max(0, s.capacity - s.sold)
        : s.ticketTypes.reduce((n, tt) => n + Math.max(0, tt.quantity - tt.sold), 0);
    const list = [...(reservations.get(s.id)?.values() ?? [])].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const offeredList = list.filter((r) => r.paymentMethod === "RESERVATION");
    const paidList = list.filter((r) => r.paymentMethod !== "RESERVATION");
    return {
      sessionId: s.id,
      eventId: s.event.id,
      eventTitle: s.event.title,
      startsAt: s.startsAt,
      venue: s.venue ? `${s.venue.name}, ${s.venue.city}` : null,
      seated,
      guestHeld,
      offered: offeredList.reduce((n, r) => n + r.places, 0),
      paid: paidList.reduce((n, r) => n + r.places, 0),
      paidCents: paidList.reduce((n, r) => n + r.paidCents, 0),
      sold: soldBySession.get(s.id) ?? 0,
      onSale,
      reservations: list,
    };
  });

  const totals = rows.reduce<InvitationTotals>(
    (acc, r) => ({
      guestHeld: acc.guestHeld + r.guestHeld,
      offered: acc.offered + r.offered,
      paid: acc.paid + r.paid,
      paidCents: acc.paidCents + r.paidCents,
      sold: acc.sold + r.sold,
      onSale: acc.onSale + r.onSale,
    }),
    { guestHeld: 0, offered: 0, paid: 0, paidCents: 0, sold: 0, onSale: 0 },
  );
  return { sessions: rows, totals };
}
