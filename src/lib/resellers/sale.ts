import "server-only";

import { createReservation, type ReservationError } from "@/lib/orders/admin-reservation";
import {
  checkAttendees,
  type AttendeeError,
  type AttendeeInput,
  type Holder,
} from "@/lib/orders/attendees";
import { resolveAutoDiscounts } from "@/lib/orders/discounts";
import type { PaymentSettle } from "@/lib/orders/edit-order";
import { mockPaymentsAllowed } from "@/lib/payment/config";
import { cardAccountForOrganizer } from "@/lib/payment/card-account";
import { prisma } from "@/lib/prisma";
import { commissionCents, commissionRule } from "./commission";

/**
 * Vente au guichet d'un point de vente, sur un ou plusieurs concerts. Espèces
 * ou terminal : billets valables tout de suite, l'argent reste au point de
 * vente. Carte en ligne : le client paie sur l'écran ou par QR, chez
 * l'organisateur, et ses billets restent en attente jusqu'au paiement. Les
 * rabais automatiques (multi-concerts, groupe) s'appliquent comme en ligne.
 */

export type PosMethod = "CASH" | "TERMINAL" | "ONLINE";

/** Délai laissé au client pour payer en ligne devant le guichet. */
const ONLINE_DUE_MS = 2 * 60 * 60 * 1000;

export type PosSaleError =
  | ReservationError
  | AttendeeError
  | "notAssigned"
  | "methodNotAllowed"
  | "notOnSale"
  | "paused"
  | "mixedOrganizers"
  | "companion_requires_paid"
  | "companion_limit"
  | "cardMissing"
  | "quantity";

export type PosSaleResult =
  | {
      ok: true;
      orderId: string;
      reference: string;
      chargeId?: string;
      token?: string;
    }
  | { ok: false; error: PosSaleError; ticketTypeId?: string };

export interface PosSaleLine {
  ticketTypeId: string;
  quantity: number;
  /** Sièges choisis sur le plan ; absents, ils sont attribués d'office. */
  seatKeys?: string[];
}

export async function sellAtPos(input: {
  agentId: string;
  resellerId: string;
  /** Lignes de tous les concerts de la vente : la séance se lit sur le tarif. */
  lines: PosSaleLine[];
  method: PosMethod;
  holderName: string;
  email: string;
  phone: string;
  locale: string;
  attendees: AttendeeInput[];
}): Promise<PosSaleResult> {
  const reseller = await prisma.reseller.findFirst({
    where: { id: input.resellerId, active: true },
    select: {
      id: true,
      commissionKind: true,
      commissionBps: true,
      commissionFixedCents: true,
      allowCashSales: true,
      allowTerminalSales: true,
      allowOnlineSales: true,
      allowPausedSales: true,
    },
  });
  if (!reseller) return { ok: false, error: "notAssigned" };
  const allowed =
    input.method === "CASH"
      ? reseller.allowCashSales
      : input.method === "TERMINAL"
        ? reseller.allowTerminalSales
        : reseller.allowOnlineSales;
  if (!allowed) return { ok: false, error: "methodNotAllowed" };

  const lines = input.lines.filter((l) => l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: "empty" };
  if (new Set(lines.map((l) => l.ticketTypeId)).size !== lines.length) {
    return { ok: false, error: "quantity" };
  }
  if (lines.some((l) => l.seatKeys?.length && l.seatKeys.length !== l.quantity)) {
    return { ok: false, error: "quantity" };
  }

  const found = await prisma.ticketType.findMany({
    where: { id: { in: lines.map((l) => l.ticketTypeId) } },
    select: {
      id: true,
      priceCents: true,
      maxPerPaidTicket: true,
      companionOfId: true,
      requiresAttendee: true,
      maxAgeYears: true,
      salesStartAt: true,
      salesEndAt: true,
      sessionId: true,
    },
  });
  const types = new Map(found.map((tt) => [tt.id, tt]));
  if (lines.some((l) => !types.has(l.ticketTypeId))) return { ok: false, error: "notFound" };

  const sessionIds = [...new Set(found.map((tt) => tt.sessionId))];
  const sessions = await prisma.eventSession.findMany({
    where: { id: { in: sessionIds } },
    select: {
      id: true,
      startsAt: true,
      status: true,
      event: {
        select: {
          id: true,
          status: true,
          salesPaused: true,
          organizerId: true,
          resellers: {
            where: { resellerId: reseller.id },
            select: { commissionKind: true, commissionBps: true, commissionFixedCents: true },
          },
        },
      },
      ticketTypes: {
        select: { id: true, requiresAttendee: true, maxAgeYears: true },
      },
    },
  });
  if (sessions.length !== sessionIds.length) return { ok: false, error: "notFound" };

  const now = new Date();
  const parts = [];
  for (const session of sessions) {
    const assignment = session.event.resellers[0];
    const own = lines.filter((l) => types.get(l.ticketTypeId)!.sessionId === session.id);
    const first = own[0]!.ticketTypeId;
    if (!assignment) return { ok: false, error: "notAssigned", ticketTypeId: first };
    if (!sellable(session.event.status) || !sellable(session.status)) {
      return { ok: false, error: "notOnSale", ticketTypeId: first };
    }
    if (session.event.salesPaused && !reseller.allowPausedSales) {
      return { ok: false, error: "paused", ticketTypeId: first };
    }
    // Un même siège ne se vend qu'une fois par séance.
    const seatKeys = own.flatMap((l) => l.seatKeys ?? []);
    if (new Set(seatKeys).size !== seatKeys.length) return { ok: false, error: "quantity" };
    for (const line of own) {
      const tt = types.get(line.ticketTypeId)!;
      if ((tt.salesStartAt && tt.salesStartAt > now) || (tt.salesEndAt && tt.salesEndAt < now)) {
        return { ok: false, error: "notOnSale", ticketTypeId: tt.id };
      }
    }

    // Gratuités et titulaires se vérifient concert par concert, comme en ligne.
    const quantities = new Map(own.map((l) => [l.ticketTypeId, l.quantity]));
    const companion = checkCompanions(
      own.map((l) => ({ ...l, type: types.get(l.ticketTypeId)! })),
      quantities,
    );
    if (companion) return { ok: false, ...companion };
    parts.push({ session, assignment, lines: own, quantities });
  }
  if (new Set(sessions.map((s) => s.event.organizerId)).size > 1) {
    return { ok: false, error: "mixedOrganizers" };
  }

  const holders = new Map<string, Holder[]>();
  for (const part of parts) {
    const checked = checkAttendees(
      part.session.ticketTypes.map((tt) => ({
        id: tt.id,
        requiresAttendee: tt.requiresAttendee,
        maxAgeYears: tt.maxAgeYears,
        sessionStartsAt: part.session.startsAt,
      })),
      part.quantities,
      input.attendees.filter((a) => part.quantities.has(a.ticketTypeId)),
    );
    if (!checked.ok) return checked;
    for (const [id, list] of checked.byType) holders.set(id, list);
  }

  const discounts = await resolveAutoDiscounts(
    lines.map((l) => ({
      ticketTypeId: l.ticketTypeId,
      quantity: l.quantity,
      seats: l.seatKeys,
    })),
    now,
  );
  const discountOf = new Map(lines.map((l, i) => [l.ticketTypeId, discounts.perLine[i] ?? 0]));
  const net = (l: PosSaleLine) =>
    types.get(l.ticketTypeId)!.priceCents * l.quantity - (discountOf.get(l.ticketTypeId) ?? 0);
  const amountCents = lines.reduce((sum, l) => sum + net(l), 0);

  // Commission de chaque concert selon sa règle, sur le montant payé.
  const commission = parts.reduce(
    (sum, part) =>
      sum +
      commissionCents(commissionRule(reseller, part.assignment), {
        amountCents: part.lines.reduce((n, l) => n + net(l), 0),
        paidTickets: part.lines.reduce(
          (n, l) => n + (types.get(l.ticketTypeId)!.priceCents > 0 ? l.quantity : 0),
          0,
        ),
      }),
    0,
  );

  let settle: PaymentSettle;
  if (amountCents <= 0) {
    settle = { method: "FREE" };
  } else if (input.method === "ONLINE") {
    const card =
      mockPaymentsAllowed() ||
      (await cardAccountForOrganizer(sessions[0]!.event.organizerId)) !== null;
    if (!card) return { ok: false, error: "cardMissing" };
    const firstStart = Math.min(...sessions.map((s) => s.startsAt.getTime()));
    const dueAt = new Date(Math.min(now.getTime() + ONLINE_DUE_MS, firstStart));
    settle = { method: "LINK", amountCents, dueAt };
  } else {
    settle = { method: input.method, amountCents };
  }

  const result = await createReservation({
    parts: parts.map((part) => ({
      sessionId: part.session.id,
      lines: part.lines.map((l) => ({
        ...l,
        discountCents: discountOf.get(l.ticketTypeId) ?? 0,
      })),
    })),
    holderName: input.holderName,
    ticketNote: "",
    locale: input.locale,
    soldByUserId: input.agentId,
    email: input.email,
    phone: input.phone,
    settle,
    reseller: { id: reseller.id, commissionCents: commission },
    holders,
    discounts: discounts.applied.map((d) => ({
      discountId: d.discountId,
      amountCents: d.amountCents,
    })),
  });
  return result;
}

function sellable(status: string): boolean {
  return status === "PUBLISHED" || status === "SOLD_OUT";
}

/** Places gratuites accompagnant des billets payants, comme en ligne. */
function checkCompanions(
  lines: {
    ticketTypeId: string;
    quantity: number;
    type: { priceCents: number; maxPerPaidTicket: number | null; companionOfId: string | null };
  }[],
  quantities: Map<string, number>,
): { error: "companion_requires_paid" | "companion_limit"; ticketTypeId: string } | null {
  const paid = lines
    .filter((l) => l.type.maxPerPaidTicket == null && l.type.priceCents > 0)
    .reduce((sum, l) => sum + l.quantity, 0);
  for (const line of lines) {
    const ratio = line.type.maxPerPaidTicket;
    if (ratio == null) continue;
    const source =
      line.type.companionOfId == null ? paid : (quantities.get(line.type.companionOfId) ?? 0);
    if (source === 0) return { error: "companion_requires_paid", ticketTypeId: line.ticketTypeId };
    if (line.quantity > source * ratio) {
      return { error: "companion_limit", ticketTypeId: line.ticketTypeId };
    }
  }
  return null;
}
