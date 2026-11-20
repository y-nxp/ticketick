import "server-only";

import { prisma } from "@/lib/prisma";
import { HOLD_PLACEHOLDER_DOMAIN } from "@/lib/orders/create-order";
import { ticketRevenueCents } from "@/lib/orders/discount-engine";
import { readLayout } from "@/lib/seating/layout";
import { zurichToUtc } from "@/lib/zurich-time";
import {
  buildSuisaReport,
  spreadOrderTotal,
  type SuisaReport,
  type SuisaTicket,
} from "./suisa-figures";

/**
 * Rapport SUISA d'un organisateur sur une période : une ligne par séance
 * jouée, avec billets payants, billets offerts et recette brute.
 *
 * Comptent les billets valables (ou déjà scannés) des commandes payées, quel
 * que soit le canal. Les frais ticketick et les options (navette, repas) ne
 * sont pas des recettes de billets : ils sont exclus. Les commandes annulées
 * ou remboursées ne comptent pas.
 */

export * from "./suisa-figures";

/** « 2026-12-27 » : jour suivant, sans passer par le fuseau du serveur. */
function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function getSuisaReport(
  organizerId: string,
  options: { from: string; to: string; vatPercent: number },
): Promise<SuisaReport> {
  const start = zurichToUtc(`${options.from}T00:00`);
  const end = zurichToUtc(`${nextDay(options.to)}T00:00`);

  const sessions = await prisma.eventSession.findMany({
    where: {
      startsAt: { gte: start, lt: end },
      status: { not: "CANCELLED" },
      event: { organizerId, status: { not: "CANCELLED" } },
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      capacity: true,
      inviteSeats: true,
      seatPlanId: true,
      doorTickets: true,
      doorRevenueCents: true,
      doorSales: { where: { cancelledAt: null }, select: { paidTickets: true, amountCents: true } },
      venue: { select: { name: true, city: true } },
      event: { select: { id: true, title: true, suisaMusic: true } },
      ticketTypes: { select: { quantity: true } },
    },
  });
  const ids = sessions.map((s) => s.id);
  const ofSession = { ticketType: { sessionId: { in: ids } } };
  const planIds = [...new Set(sessions.map((s) => s.seatPlanId).filter((id): id is string => !!id))];

  const [plans, tickets, pendingItems, pendingTickets] = await Promise.all([
    prisma.seatPlan.findMany({ where: { id: { in: planIds } }, select: { id: true, layout: true } }),
    prisma.ticket.findMany({
      where: { ...ofSession, status: { in: ["VALID", "USED"] }, order: { status: "PAID" } },
      select: {
        id: true,
        ticketTypeId: true,
        ticketType: { select: { sessionId: true } },
        order: {
          select: {
            id: true,
            channel: true,
            paymentMethod: true,
            totalCents: true,
            subtotalCents: true,
            discountCents: true,
            items: {
              select: { ticketTypeId: true, unitPriceCents: true, quantity: true, discountCents: true },
            },
          },
        },
      },
    }),
    prisma.orderItem.findMany({
      where: {
        ...ofSession,
        order: {
          status: "AWAITING_PAYMENT",
          NOT: { email: { endsWith: `@${HOLD_PLACEHOLDER_DOMAIN}` } },
        },
      },
      select: { quantity: true, ticketType: { select: { sessionId: true } } },
    }),
    prisma.ticket.findMany({
      where: { ...ofSession, status: "PENDING", order: { status: "PAID" } },
      select: { ticketType: { select: { sessionId: true } } },
    }),
  ]);

  // Guichet de l'admin : le montant reçu, réparti sur tous les billets de la
  // commande, y compris ceux d'autres séances que la période.
  const boxOrders = new Map<string, (typeof tickets)[number]["order"]>();
  for (const t of tickets) {
    if (t.order.channel === "BOX_OFFICE" && t.order.paymentMethod !== "RESERVATION") {
      boxOrders.set(t.order.id, t.order);
    }
  }
  const boxShare = new Map<string, number>();
  if (boxOrders.size > 0) {
    const all = await prisma.ticket.findMany({
      where: { orderId: { in: [...boxOrders.keys()] }, status: { in: ["VALID", "USED"] } },
      orderBy: { id: "asc" },
      select: { id: true, orderId: true, ticketTypeId: true },
    });
    const byOrder = new Map<string, typeof all>();
    for (const t of all) byOrder.set(t.orderId, [...(byOrder.get(t.orderId) ?? []), t]);
    for (const [orderId, list] of byOrder) {
      const order = boxOrders.get(orderId)!;
      const shares = spreadOrderTotal(
        order.totalCents,
        list.map((t) => ticketRevenueCents(order, t.ticketTypeId)),
      );
      list.forEach((t, i) => boxShare.set(t.id, shares[i]!));
    }
  }

  const sold: SuisaTicket[] = tickets.map((t) => ({
    sessionId: t.ticketType.sessionId,
    revenueCents: boxShare.has(t.id)
      ? boxShare.get(t.id)!
      : t.order.channel === "BOX_OFFICE"
        ? 0
        : ticketRevenueCents(t.order, t.ticketTypeId),
  }));

  const pending = new Map<string, number>();
  for (const item of pendingItems) {
    const id = item.ticketType.sessionId;
    pending.set(id, (pending.get(id) ?? 0) + item.quantity);
  }
  for (const t of pendingTickets) {
    const id = t.ticketType.sessionId;
    pending.set(id, (pending.get(id) ?? 0) + 1);
  }

  const seatsInPlan = new Map(plans.map((p) => [p.id, readLayout(p.layout)?.seats.length ?? 0]));
  return buildSuisaReport(
    sessions.map((s) => ({
      sessionId: s.id,
      eventId: s.event.id,
      eventTitle: s.event.title,
      startsAt: s.startsAt,
      venue: s.venue ? `${s.venue.name}, ${s.venue.city}` : null,
      capacity:
        s.seatPlanId && seatsInPlan.get(s.seatPlanId)
          ? seatsInPlan.get(s.seatPlanId)!
          : s.capacity != null
            ? s.capacity + s.inviteSeats
            : s.ticketTypes.reduce((n, tt) => n + tt.quantity, 0) || null,
      music: s.event.suisaMusic,
      doorTickets: s.doorTickets,
      doorRevenueCents: s.doorRevenueCents,
      // Ventes de la caisse sur place, ajoutées à la caisse du soir.
      tillTickets: s.doorSales.reduce((n, sale) => n + sale.paidTickets, 0),
      tillCents: s.doorSales.reduce((n, sale) => n + sale.amountCents, 0),
    })),
    sold,
    pending,
    options.vatPercent,
  );
}

/** Période par défaut : les 30 derniers jours, aujourd'hui compris. */
export function defaultSuisaPeriod(now = new Date()): { from: string; to: string } {
  const day = (d: Date) =>
    new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Zurich" }).format(d);
  return { from: day(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000)), to: day(now) };
}

/** Lit la période et le taux de TVA de l'adresse ; valeurs par défaut sinon. */
export function readSuisaQuery(query: { from?: string; to?: string; tva?: string }) {
  const fallback = defaultSuisaPeriod();
  let from = query.from && DAY.test(query.from) ? query.from : fallback.from;
  let to = query.to && DAY.test(query.to) ? query.to : fallback.to;
  if (from > to) [from, to] = [to, from];
  const vat = Number((query.tva ?? "").replace(",", "."));
  const vatPercent = Number.isFinite(vat) && vat > 0 && vat < 30 ? vat : 0;
  return { from, to, vatPercent };
}
