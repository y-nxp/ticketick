import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readLayout, zoneAllowed, type SeatLayout } from "@/lib/seating/layout";
import { claimSeats, syncSessionSeats } from "@/lib/seating/seats";
import { issueMissingTickets } from "@/lib/tickets/issue";
import { generateReference, SoldOutError, takeStock } from "./create-order";
import { openPaymentCharge, type PaymentSettle } from "./edit-order";

/**
 * Réservation saisie dans l'admin : « 10 places en catégorie 1 pour
 * Illyria ». Offerte, ses billets sont valables tout de suite et l'admin les
 * remet lui-même ; elle ne compte pour rien dans l'encaissé. Payante, elle
 * ouvre un règlement : espèces, lien de paiement (billets en attente jusqu'au
 * paiement) ou paiement sur place.
 *
 * Le stock est pris comme pour une vente en ligne, mais sans fenêtre de vente,
 * plafond par commande ni statut de publication : on réserve souvent avant
 * l'ouverture.
 */

export interface ReservationInput {
  sessionId: string;
  lines: { ticketTypeId: string; quantity: number }[];
  /** Nom et prénom, facultatif. */
  holderName: string;
  /** Mention imprimée sur chaque billet, facultative. */
  ticketNote: string;
  locale: string;
  soldByUserId: string;
  /**
   * Places mises de côté pour les invités : sièges bloqués sur plan, places
   * retirées de la jauge en placement libre (la jauge remonte d'autant).
   */
  fromInvites?: boolean;
  email?: string;
  phone?: string;
  /** Sans règlement : réservation offerte, comme jusqu'ici. */
  settle?: PaymentSettle;
}

export type ReservationError =
  | "empty"
  | "notFound"
  | "sessionPast"
  | "soldOut"
  | "seatsUnavailable"
  | "invitesUnavailable"
  | "retry";

export type ReservationResult =
  | { ok: true; orderId: string; chargeId?: string; token?: string }
  | { ok: false; error: ReservationError; ticketTypeId?: string };

const PAID_METHOD = { FREE: "RESERVATION", CASH: "CASH", DOOR: "CASH", LINK: "CARD" } as const;

export async function createReservation(
  input: ReservationInput,
): Promise<ReservationResult> {
  const lines = input.lines.filter((l) => l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: "empty" };

  const session = await prisma.eventSession.findUnique({
    where: { id: input.sessionId },
    select: {
      id: true,
      startsAt: true,
      capacity: true,
      seatPlan: { select: { layout: true } },
      ticketTypes: {
        select: { id: true, priceCents: true, currency: true, seatZones: true },
      },
    },
  });
  if (!session) return { ok: false, error: "notFound" };
  if (session.startsAt <= new Date()) return { ok: false, error: "sessionPast" };

  const types = new Map(session.ticketTypes.map((tt) => [tt.id, tt]));
  if (lines.some((l) => !types.has(l.ticketTypeId))) {
    return { ok: false, error: "notFound" };
  }

  const layout = readLayout(session.seatPlan?.layout);
  const subtotalCents = lines.reduce(
    (sum, l) => sum + types.get(l.ticketTypeId)!.priceCents * l.quantity,
    0,
  );

  const fromInvites = input.fromInvites === true;
  const settle: PaymentSettle = input.settle ?? { method: "FREE" };
  const free = settle.method === "FREE" || settle.amountCents <= 0;
  try {
    const created = await prisma.$transaction(async (tx) => {
      if (fromInvites && !layout) await returnHeldToSale(tx, session.id, lines);
      await takeStock(
        tx,
        lines.map((l) => ({
          ...l,
          sessionId: session.id,
          capacity: session.capacity,
        })),
      );

      const name = input.holderName.trim();
      const order = await tx.order.create({
        data: {
          reference: generateReference(),
          email: input.email?.trim().toLowerCase() ?? "",
          firstName: "",
          lastName: name,
          phone: input.phone?.trim() || null,
          locale: input.locale,
          ticketNote: input.ticketNote.trim() || null,
          status: "PAID",
          paymentMethod: free ? "RESERVATION" : PAID_METHOD[settle.method],
          channel: "BOX_OFFICE",
          soldByUserId: input.soldByUserId,
          // Offerte : prix des tarifs gardés pour mémoire. Payante : le total
          // suit l'encaissé, porté par le règlement.
          subtotalCents,
          discountCents: free ? subtotalCents : 0,
          totalCents: 0,
          currency: types.get(lines[0]!.ticketTypeId)!.currency,
          items: {
            create: lines.map((l) => ({
              ticketTypeId: l.ticketTypeId,
              quantity: l.quantity,
              unitPriceCents: types.get(l.ticketTypeId)!.priceCents,
            })),
          },
        },
        select: { id: true, reference: true, currency: true },
      });

      const seatsByType = layout
        ? await assignSeats(tx, {
            orderId: order.id,
            sessionId: session.id,
            layout,
            lines: lines.map((l) => ({
              ...l,
              zones: types.get(l.ticketTypeId)!.seatZones,
            })),
            fromInvites,
          })
        : new Map<string, string[]>();

      const items = lines.map((l) => ({
        ticketTypeId: l.ticketTypeId,
        quantity: l.quantity,
        seatKeys: seatsByType.get(l.ticketTypeId) ?? [],
      }));
      for (const item of items) {
        if (item.seatKeys.length === 0) continue;
        await tx.orderItem.updateMany({
          where: { orderId: order.id, ticketTypeId: item.ticketTypeId },
          data: { seatKeys: item.seatKeys },
        });
      }
      const codes = await issueMissingTickets(
        tx,
        { id: order.id, items },
        settle.method === "LINK" && !free ? "PENDING" : "VALID",
      );
      const ticketIds = (
        await tx.ticket.findMany({ where: { code: { in: codes } }, select: { id: true } })
      ).map((t) => t.id);
      const charge = await openPaymentCharge(tx, order, {
        settle,
        ticketIds,
        fromInvites,
        actorId: input.soldByUserId,
      });
      return { orderId: order.id, ...charge };
    });
    return { ok: true, ...created };
  } catch (error) {
    if (error instanceof SoldOutError) {
      return { ok: false, error: "soldOut", ticketTypeId: error.ticketTypeId };
    }
    if (error instanceof NoSeatsError) {
      return {
        ok: false,
        error: fromInvites ? "invitesUnavailable" : "seatsUnavailable",
        ticketTypeId: error.ticketTypeId,
      };
    }
    if (error instanceof SeatRaceError) return { ok: false, error: "retry" };
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, error: "retry" };
    }
    throw error;
  }
}

/**
 * Placement libre : les places invités sont celles retirées de la jauge. La
 * jauge remonte du nombre réservé, la vente publique ne perd donc rien.
 */
export async function returnHeldToSale(
  tx: Prisma.TransactionClient,
  sessionId: string,
  lines: { quantity: number }[],
): Promise<void> {
  const n = lines.reduce((sum, l) => sum + l.quantity, 0);
  await tx.$executeRaw`
    UPDATE "EventSession"
    SET capacity = capacity + ${n}
    WHERE id = ${sessionId} AND capacity IS NOT NULL
  `;
}

export class NoSeatsError extends Error {
  constructor(readonly ticketTypeId: string) {
    super(`Pas assez de sièges libres pour ${ticketTypeId}`);
  }
}

export class SeatRaceError extends Error {}

/**
 * Attribue des sièges de la zone du tarif : côte à côte dans un même rang
 * quand c'est possible, sinon les premiers dans l'ordre du plan. Sièges libres
 * par défaut ; avec `fromInvites`, uniquement les places bloquées.
 */
export async function assignSeats(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    sessionId: string;
    layout: SeatLayout;
    lines: { ticketTypeId: string; quantity: number; zones: string[] }[];
    fromInvites?: boolean;
  },
): Promise<Map<string, string[]>> {
  await syncSessionSeats(input.sessionId, tx);
  const pool = input.fromInvites ? "BLOCKED" : "AVAILABLE";
  const free = new Set(
    (
      await tx.sessionSeat.findMany({
        where: { sessionId: input.sessionId, status: pool },
        select: { seatKey: true },
      })
    ).map((s) => s.seatKey),
  );

  const rows = new Map<string, SeatLayout["seats"]>();
  for (const seat of input.layout.seats) {
    const key = `${seat.section}\u0000${seat.row}`;
    rows.set(key, [...(rows.get(key) ?? []), seat]);
  }

  const out = new Map<string, string[]>();
  for (const line of input.lines) {
    const eligible = (seat: SeatLayout["seats"][number]) =>
      free.has(seat.key) && zoneAllowed(line.zones, seat.zone);

    let picked: string[] | null = null;
    for (const row of rows.values()) {
      for (let start = 0; start + line.quantity <= row.length; start++) {
        const run = row.slice(start, start + line.quantity);
        if (run.every(eligible)) {
          picked = run.map((s) => s.key);
          break;
        }
      }
      if (picked) break;
    }
    picked ??= input.layout.seats
      .filter(eligible)
      .slice(0, line.quantity)
      .map((s) => s.key);
    if (picked.length < line.quantity) throw new NoSeatsError(line.ticketTypeId);

    const got = await claimSeats(tx, {
      orderId: input.orderId,
      sessionId: input.sessionId,
      keys: picked,
      zones: line.zones,
      from: [pool],
    });
    if (got !== picked.length) throw new SeatRaceError();
    picked.forEach((key) => free.delete(key));
    out.set(line.ticketTypeId, picked);
  }
  return out;
}
