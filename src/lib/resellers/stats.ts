import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { commissionRule, type CommissionRule } from "./commission";
import { shareOut } from "./split";

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
  /** Commission sur les ventes encaissées par le point de vente (espèces, terminal). */
  onSiteCommissionCents: number;
  /** Commission sur les ventes payées par carte en ligne chez l'organisateur. */
  onlineCommissionCents: number;
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
    onSiteCommissionCents: 0,
    onlineCommissionCents: 0,
    pendingTickets: 0,
  };
}

/**
 * Ventile les totaux d'une vente sur ses concerts : billets comptés là où
 * ils sont, montants au prorata de ce que rapportent les billets valables de
 * chaque concert (rabais déduit). Une vente sur un seul concert lui revient
 * entière.
 */
function splitByEvent(
  order: {
    tickets: { status: string; ticketTypeId: string }[];
    items: {
      ticketTypeId: string;
      quantity: number;
      unitPriceCents: number;
      discountCents: number;
      ticketType: { session: { eventId: string } };
    }[];
  },
  row: PosTotals,
  isValid: (t: { status: string }) => boolean,
  byEvent: Map<string, PosTotals>,
): void {
  const itemOf = new Map(order.items.map((i) => [i.ticketTypeId, i]));
  const eventIds = [...new Set(order.items.map((i) => i.ticketType.session.eventId))];
  if (eventIds.length === 0) return;
  const parts = eventIds.map(() => emptyTotals());
  const weights = eventIds.map(() => 0);
  for (const ticket of order.tickets) {
    const item = itemOf.get(ticket.ticketTypeId);
    if (!item) continue;
    const at = eventIds.indexOf(item.ticketType.session.eventId);
    if (ticket.status === "PENDING") parts[at]!.pendingTickets += 1;
    if (!isValid(ticket)) continue;
    parts[at]!.tickets += 1;
    weights[at]! += item.unitPriceCents - item.discountCents / Math.max(1, item.quantity);
  }
  // Billets tous gratuits : au nombre de billets.
  const basis = weights.some((w) => w > 0) ? weights : parts.map((p) => p.tickets);
  const money = [
    "amountCents",
    "cashCents",
    "terminalCents",
    "onlineCents",
    "commissionCents",
    "onSiteCommissionCents",
    "onlineCommissionCents",
  ] as const;
  for (const key of money) {
    shareOut(row[key], basis).forEach((cents, at) => {
      parts[at]![key] = cents;
    });
  }
  eventIds.forEach((eventId, at) => {
    const into = byEvent.get(eventId) ?? emptyTotals();
    add(into, parts[at]!);
    byEvent.set(eventId, into);
  });
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
      charges: { select: { kind: true, status: true, method: true, amountCents: true, provider: true } },
      tickets: { select: { status: true, ticketTypeId: true } },
      items: {
        select: {
          ticketTypeId: true,
          quantity: true,
          unitPriceCents: true,
          discountCents: true,
          ticketType: { select: { session: { select: { eventId: true } } } },
        },
      },
    },
  });

  const byEvent = new Map<string, PosTotals>();
  for (const order of orders) {
    const row = emptyTotals();
    const isValid = (t: { status: string }) => t.status === "VALID" || t.status === "USED";
    const valid = order.tickets.filter(isValid).length;
    row.pendingTickets += order.tickets.filter((t) => t.status === "PENDING").length;
    if (valid > 0) {
      row.tickets += valid;
      row.amountCents += order.totalCents;
      row.commissionCents += order.commissionCents;
      let onSite = 0;
      let online = 0;
      for (const charge of order.charges) {
        if (charge.status !== "DONE") continue;
        // Un remboursement ne compte que s'il a été rendu par le point de
        // vente : celui de l'organisateur ne change pas ce qu'il a encaissé.
        if (charge.kind === "REFUND") {
          if (charge.provider === "reseller") row.cashCents -= charge.amountCents;
          if (charge.provider === "reseller") onSite -= charge.amountCents;
          continue;
        }
        if (charge.method === "CASH") row.cashCents += charge.amountCents;
        else if (charge.method === "TERMINAL") row.terminalCents += charge.amountCents;
        else if (charge.method === "LINK") row.onlineCents += charge.amountCents;
        if (charge.method === "LINK") online += charge.amountCents;
        else if (charge.method === "CASH" || charge.method === "TERMINAL") onSite += charge.amountCents;
      }
      const onlineShare =
        online + onSite > 0
          ? Math.round((order.commissionCents * online) / (online + onSite))
          : 0;
      row.onlineCommissionCents += onlineShare;
      row.onSiteCommissionCents += order.commissionCents - onlineShare;
    }
    splitByEvent(order, row, isValid, byEvent);
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
