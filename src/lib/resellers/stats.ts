import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { commissionRule, type CommissionRule } from "./commission";

/**
 * Ventes d'un point de vente, par spectacle attribué. Une vente ne compte
 * qu'une fois payée : espèces et terminal tout de suite, carte en ligne au
 * paiement. Les liens en attente sont comptés à part, les ventes annulées
 * ou remboursées ignorées.
 */

export interface PosTotals {
  tickets: number;
  amountCents: number;
  cashCents: number;
  terminalCents: number;
  onlineCents: number;
  commissionCents: number;
  pendingTickets: number;
}

export interface PosEventStats extends PosTotals {
  eventId: string;
  title: Prisma.JsonValue;
  organizerName: string;
  status: string;
  nextStartsAt: Date | null;
  lastStartsAt: Date | null;
  rule: CommissionRule;
  /** Commission propre au spectacle, sinon celle du point de vente. */
  overridden: boolean;
}

export interface PosStats {
  events: PosEventStats[];
  totals: PosTotals;
  /**
   * Solde du point de vente : positif, l'organisateur lui doit (commissions
   * des ventes en ligne) ; négatif, il doit reverser (espèces et terminal,
   * moins sa commission).
   */
  balanceCents: number;
}

export function emptyTotals(): PosTotals {
  return {
    tickets: 0,
    amountCents: 0,
    cashCents: 0,
    terminalCents: 0,
    onlineCents: 0,
    commissionCents: 0,
    pendingTickets: 0,
  };
}

function add(into: PosTotals, from: PosTotals): void {
  for (const key of Object.keys(into) as (keyof PosTotals)[]) into[key] += from[key];
}

export async function resellerStats(
  resellerId: string,
  options: { organizerId?: string | null; from?: Date; to?: Date } = {},
): Promise<PosStats> {
  const eventWhere = options.organizerId ? { organizerId: options.organizerId } : {};
  const reseller = await prisma.reseller.findUniqueOrThrow({
    where: { id: resellerId },
    select: {
      commissionKind: true,
      commissionBps: true,
      commissionFixedCents: true,
      events: {
        where: { event: eventWhere },
        select: {
          commissionKind: true,
          commissionBps: true,
          commissionFixedCents: true,
          event: {
            select: {
              id: true,
              title: true,
              status: true,
              organizer: { select: { name: true } },
              sessions: {
                where: { status: { not: "CANCELLED" } },
                orderBy: { startsAt: "asc" },
                select: { startsAt: true },
              },
            },
          },
        },
      },
    },
  });

  const orders = await prisma.order.findMany({
    where: {
      resellerId,
      status: { notIn: ["CANCELLED", "REFUNDED"] },
      createdAt: { gte: options.from, lt: options.to },
      items: { some: { ticketType: { session: { event: eventWhere } } } },
    },
    select: {
      totalCents: true,
      commissionCents: true,
      paymentMethod: true,
      charges: { select: { status: true, method: true, amountCents: true } },
      tickets: { select: { status: true } },
      items: { take: 1, select: { ticketType: { select: { session: { select: { eventId: true } } } } } },
    },
  });

  const byEvent = new Map<string, PosTotals>();
  for (const order of orders) {
    const eventId = order.items[0]?.ticketType.session.eventId;
    if (!eventId) continue;
    const row = byEvent.get(eventId) ?? emptyTotals();
    const valid = order.tickets.filter((t) => t.status === "VALID" || t.status === "USED").length;
    const pending = order.tickets.filter((t) => t.status === "PENDING").length;
    row.pendingTickets += pending;
    if (valid > 0) {
      row.tickets += valid;
      row.amountCents += order.totalCents;
      row.commissionCents += order.commissionCents;
      for (const charge of order.charges) {
        if (charge.status !== "DONE") continue;
        if (charge.method === "CASH") row.cashCents += charge.amountCents;
        else if (charge.method === "TERMINAL") row.terminalCents += charge.amountCents;
        else if (charge.method === "LINK") row.onlineCents += charge.amountCents;
      }
    }
    byEvent.set(eventId, row);
  }

  const now = new Date();
  const totals = emptyTotals();
  const events = reseller.events.map((assignment): PosEventStats => {
    const row = byEvent.get(assignment.event.id) ?? emptyTotals();
    add(totals, row);
    const starts = assignment.event.sessions.map((s) => s.startsAt);
    return {
      ...row,
      eventId: assignment.event.id,
      title: assignment.event.title,
      organizerName: assignment.event.organizer.name,
      status: assignment.event.status,
      nextStartsAt: starts.find((d) => d > now) ?? null,
      lastStartsAt: starts.at(-1) ?? null,
      rule: commissionRule(reseller, assignment),
      overridden: assignment.commissionKind != null,
    };
  });
  // Ventes d'un spectacle retiré depuis : elles comptent dans les totaux.
  const assigned = new Set(events.map((e) => e.eventId));
  for (const [eventId, row] of byEvent) if (!assigned.has(eventId)) add(totals, row);

  // À venir d'abord, du plus proche au plus lointain, puis les passés.
  events.sort((a, b) => {
    if (a.nextStartsAt && b.nextStartsAt) return a.nextStartsAt.getTime() - b.nextStartsAt.getTime();
    if (a.nextStartsAt || b.nextStartsAt) return a.nextStartsAt ? -1 : 1;
    return (b.lastStartsAt?.getTime() ?? 0) - (a.lastStartsAt?.getTime() ?? 0);
  });
  return {
    events,
    totals,
    balanceCents: totals.commissionCents - totals.cashCents - totals.terminalCents,
  };
}
