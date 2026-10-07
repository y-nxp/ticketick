import "server-only";

import { createReservation, type ReservationError } from "@/lib/orders/admin-reservation";
import { checkAttendees, type AttendeeError, type AttendeeInput } from "@/lib/orders/attendees";
import type { PaymentSettle } from "@/lib/orders/edit-order";
import { mockPaymentsAllowed } from "@/lib/payment/config";
import { cardAccountForOrganizer } from "@/lib/payment/card-account";
import { prisma } from "@/lib/prisma";
import { commissionCents, commissionRule } from "./commission";

/**
 * Vente au guichet d'un point de vente. Espèces ou terminal : billets
 * valables tout de suite, l'argent reste au point de vente. Carte en ligne :
 * le client paie sur l'écran ou par QR, chez l'organisateur, et ses billets
 * restent en attente jusqu'au paiement.
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
  | "companion_requires_paid"
  | "companion_limit"
  | "cardMissing";

export type PosSaleResult =
  | {
      ok: true;
      orderId: string;
      reference: string;
      eventId: string;
      chargeId?: string;
      token?: string;
    }
  | { ok: false; error: PosSaleError; ticketTypeId?: string };

export async function sellAtPos(input: {
  agentId: string;
  resellerId: string;
  sessionId: string;
  lines: { ticketTypeId: string; quantity: number }[];
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

  const session = await prisma.eventSession.findUnique({
    where: { id: input.sessionId },
    select: {
      id: true,
      startsAt: true,
      status: true,
      event: {
        select: {
          id: true,
          status: true,
          organizerId: true,
          resellers: {
            where: { resellerId: reseller.id },
            select: { commissionKind: true, commissionBps: true, commissionFixedCents: true },
          },
        },
      },
      ticketTypes: {
        select: {
          id: true,
          priceCents: true,
          maxPerPaidTicket: true,
          companionOfId: true,
          requiresAttendee: true,
          maxAgeYears: true,
          salesStartAt: true,
          salesEndAt: true,
        },
      },
    },
  });
  const assignment = session?.event.resellers[0];
  if (!session || !assignment) return { ok: false, error: "notAssigned" };
  if (!sellable(session.event.status) || !sellable(session.status)) {
    return { ok: false, error: "notOnSale" };
  }

  const lines = input.lines.filter((l) => l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: "empty" };
  const types = new Map(session.ticketTypes.map((tt) => [tt.id, tt]));
  const now = new Date();
  for (const line of lines) {
    const tt = types.get(line.ticketTypeId);
    if (!tt) return { ok: false, error: "notFound" };
    if ((tt.salesStartAt && tt.salesStartAt > now) || (tt.salesEndAt && tt.salesEndAt < now)) {
      return { ok: false, error: "notOnSale", ticketTypeId: tt.id };
    }
  }

  const quantities = new Map(lines.map((l) => [l.ticketTypeId, l.quantity]));
  const companion = checkCompanions(
    lines.map((l) => ({ ...l, type: types.get(l.ticketTypeId)! })),
    quantities,
  );
  if (companion) return { ok: false, ...companion };

  const checked = checkAttendees(
    session.ticketTypes.map((tt) => ({
      id: tt.id,
      requiresAttendee: tt.requiresAttendee,
      maxAgeYears: tt.maxAgeYears,
      sessionStartsAt: session.startsAt,
    })),
    quantities,
    input.attendees,
  );
  if (!checked.ok) return checked;

  const amountCents = lines.reduce(
    (sum, l) => sum + types.get(l.ticketTypeId)!.priceCents * l.quantity,
    0,
  );
  const paidTickets = lines.reduce(
    (sum, l) => sum + (types.get(l.ticketTypeId)!.priceCents > 0 ? l.quantity : 0),
    0,
  );

  let settle: PaymentSettle;
  if (amountCents <= 0) {
    settle = { method: "FREE" };
  } else if (input.method === "ONLINE") {
    const card =
      mockPaymentsAllowed() ||
      (await cardAccountForOrganizer(session.event.organizerId)) !== null;
    if (!card) return { ok: false, error: "cardMissing" };
    const dueAt = new Date(Math.min(now.getTime() + ONLINE_DUE_MS, session.startsAt.getTime()));
    settle = { method: "LINK", amountCents, dueAt };
  } else {
    settle = { method: input.method, amountCents };
  }

  const result = await createReservation({
    sessionId: session.id,
    lines,
    holderName: input.holderName,
    ticketNote: "",
    locale: input.locale,
    soldByUserId: input.agentId,
    email: input.email,
    phone: input.phone,
    settle,
    reseller: {
      id: reseller.id,
      commissionCents: commissionCents(commissionRule(reseller, assignment), {
        amountCents,
        paidTickets,
      }),
    },
    holders: checked.byType,
  });
  if (!result.ok) return result;
  return { ...result, eventId: session.event.id };
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
