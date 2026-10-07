import "server-only";

import { randomBytes } from "node:crypto";
import { Prisma, type ChargeMethod, type TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readLayout, seatLabel, zoneAllowed } from "@/lib/seating/layout";
import { claimSeats, releaseSeats, syncSessionSeats } from "@/lib/seating/seats";
import { issueMissingTickets } from "@/lib/tickets/issue";
import {
  assignSeats,
  NoSeatsError,
  returnHeldToSale,
  SeatRaceError,
} from "./admin-reservation";
import { hashHoldToken, SoldOutError, takeStock } from "./create-order";

/**
 * Modification d'une commande depuis l'admin : coordonnées, places retirées
 * ou ajoutées, sièges déplacés.
 *
 * Toute différence de prix passe par un règlement (`OrderCharge`) : espèces,
 * lien de paiement, paiement sur place, note de crédit ou remboursement chez
 * le prestataire. `Order.totalCents` suit l'encaissé net et ne bouge qu'au
 * règlement effectif ; un lien non payé n'entre donc pas dans les ventes.
 */

export type EditError =
  | "notFound"
  | "notEditable"
  | "reseller"
  | "empty"
  | "used"
  | "sessionPast"
  | "soldOut"
  | "seatsUnavailable"
  | "invitesUnavailable"
  | "amount"
  | "refundTooHigh"
  | "providerMissing"
  | "emailMissing"
  | "cardMissing"
  | "retry";

export class EditFailure extends Error {
  constructor(
    readonly code: EditError,
    readonly ticketTypeId?: string,
  ) {
    super(code);
  }
}

export type EditResult =
  | { ok: true; chargeId?: string }
  | { ok: false; error: EditError; ticketTypeId?: string };

/** Différence due par le client pour des places ajoutées. */
export type PaymentSettle =
  | { method: "FREE" }
  | { method: "CASH" | "DOOR" | "TERMINAL"; amountCents: number }
  | { method: "LINK"; amountCents: number; dueAt: Date };

/** Différence rendue au client pour des places retirées. */
export type RefundSettle =
  | { method: "NONE" }
  | { method: "CASH" | "CREDIT_NOTE" | "PROVIDER"; amountCents: number };

/** Prestataires chez qui un paiement d'origine se rembourse par l'API. */
export const REFUNDABLE_PROVIDERS = ["postfinance", "paypal", "stripe", "mock"];

export function invitesNote(reference: string): string {
  return `Invitations — ${reference}`;
}

const orderSelect = {
  id: true,
  reference: true,
  status: true,
  totalCents: true,
  currency: true,
  email: true,
  locale: true,
  resellerId: true,
  payment: { select: { provider: true, status: true } },
  items: {
    select: {
      id: true,
      ticketTypeId: true,
      quantity: true,
      unitPriceCents: true,
      seatKeys: true,
      ticketType: {
        select: {
          sessionId: true,
          seatZones: true,
          session: {
            select: {
              capacity: true,
              seatPlan: { select: { layout: true } },
            },
          },
        },
      },
    },
  },
  tickets: { select: { id: true, ticketTypeId: true, status: true, seatKey: true } },
  charges: {
    where: { status: "OPEN" as const, kind: "PAYMENT" as const },
    select: { id: true, ticketIds: true, amountCents: true },
  },
} satisfies Prisma.OrderSelect;

export type LockedOrder = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;

/**
 * Verrouille la commande le temps de la transaction. Règlements, échéances et
 * modifications passent tous par ce verrou, toujours pris en premier : deux
 * opérations ne peuvent pas se croiser sur les mêmes billets.
 */
export async function lockOrder(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<LockedOrder> {
  const [row] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE
  `;
  if (!row) throw new EditFailure("notFound");
  return tx.order.findUniqueOrThrow({ where: { id: row.id }, select: orderSelect });
}

function assertEditable(order: LockedOrder, changesSeats: boolean): void {
  if (order.status !== "PAID") throw new EditFailure("notEditable");
  // La commission du revendeur est figée à la vente : ses commandes ne
  // changent ni de places ni de montant ici.
  if (changesSeats && order.resellerId) throw new EditFailure("reseller");
}

const ACTIVE: TicketStatus[] = ["VALID", "PENDING"];

/**
 * Retire des billets : stock et sièges rendus (à la vente ou aux invitations),
 * billets annulés, liens de paiement en cours réduits d'autant. Renvoie le
 * prix des billets retirés qui avaient été réglés.
 */
export async function releaseTickets(
  tx: Prisma.TransactionClient,
  order: LockedOrder,
  ticketIds: string[],
  toInvites: boolean,
): Promise<{ paidCents: number }> {
  const ids = new Set(ticketIds);
  const tickets = order.tickets.filter((t) => ids.has(t.id));
  if (tickets.length === 0 || tickets.length !== ids.size) {
    throw new EditFailure("notFound");
  }
  if (tickets.some((t) => t.status === "USED")) throw new EditFailure("used");
  if (tickets.some((t) => !ACTIVE.includes(t.status))) {
    throw new EditFailure("notFound");
  }

  const priceOf = new Map(order.items.map((i) => [i.ticketTypeId, i.unitPriceCents]));
  const byType = new Map<string, typeof tickets>();
  for (const ticket of tickets) {
    byType.set(ticket.ticketTypeId, [...(byType.get(ticket.ticketTypeId) ?? []), ticket]);
  }

  for (const [ticketTypeId, group] of byType) {
    const items = order.items.filter((i) => i.ticketTypeId === ticketTypeId);
    const first = items[0];
    if (!first) throw new EditFailure("notFound");
    const keys = new Set(group.map((t) => t.seatKey).filter((k): k is string => !!k));
    let left = group.length;
    for (const item of items) {
      const take = Math.min(item.quantity, left);
      left -= take;
      await tx.orderItem.update({
        where: { id: item.id },
        data: {
          quantity: item.quantity - take,
          seatKeys: item.seatKeys.filter((k) => !keys.has(k)),
        },
      });
    }

    const n = group.length;
    const { sessionId, session } = first.ticketType;
    await tx.$executeRaw`
      UPDATE "TicketType" SET sold = GREATEST(sold - ${n}, 0) WHERE id = ${ticketTypeId}
    `;
    const layout = readLayout(session.seatPlan?.layout);
    if (toInvites && !layout) {
      // Placement libre : les invitations sont des places retirées de la jauge.
      await tx.$executeRaw`
        UPDATE "EventSession"
        SET sold = GREATEST(sold - ${n}, 0),
            capacity = CASE WHEN capacity IS NULL THEN NULL ELSE GREATEST(capacity - ${n}, 0) END
        WHERE id = ${sessionId}
      `;
    } else {
      await tx.$executeRaw`
        UPDATE "EventSession" SET sold = GREATEST(sold - ${n}, 0) WHERE id = ${sessionId}
      `;
    }
    await releaseSeats(tx, {
      orderId: order.id,
      sessionId,
      keys: [...keys],
      blockNote: toInvites ? invitesNote(order.reference) : null,
    });
  }

  await tx.ticket.updateMany({
    where: { id: { in: [...ids] } },
    data: { status: "CANCELLED" },
  });

  // Billets d'un lien ou d'un paiement sur place pas encore réglé : rien à
  // rendre, le montant attendu baisse d'autant.
  const unpaid = new Set<string>();
  for (const charge of order.charges) {
    const removed = charge.ticketIds.filter((id) => ids.has(id));
    if (removed.length === 0) continue;
    removed.forEach((id) => unpaid.add(id));
    const rest = charge.ticketIds.filter((id) => !ids.has(id));
    const less = tickets
      .filter((t) => removed.includes(t.id))
      .reduce((sum, t) => sum + (priceOf.get(t.ticketTypeId) ?? 0), 0);
    await tx.orderCharge.update({
      where: { id: charge.id },
      data:
        rest.length === 0
          ? { status: "CANCELLED", ticketIds: [], settledAt: new Date() }
          : { ticketIds: rest, amountCents: Math.max(0, charge.amountCents - less) },
    });
  }

  const paidCents = tickets
    .filter((t) => !unpaid.has(t.id))
    .reduce((sum, t) => sum + (priceOf.get(t.ticketTypeId) ?? 0), 0);
  return { paidCents: Math.min(paidCents, order.totalCents) };
}

/** Plus aucun billet actif : la commande sort des ventes. */
async function closeIfEmpty(
  tx: Prisma.TransactionClient,
  order: LockedOrder,
  removed: string[],
  refunded: boolean,
): Promise<void> {
  const gone = new Set(removed);
  const left = order.tickets.some(
    (t) => !gone.has(t.id) && t.status !== "CANCELLED",
  );
  if (left) return;
  await tx.order.update({
    where: { id: order.id },
    data: { status: refunded ? "REFUNDED" : "CANCELLED" },
  });
}

export async function nextChargeNumber(
  tx: Prisma.TransactionClient,
  order: { id: string; reference: string },
): Promise<string> {
  const n = await tx.orderCharge.count({ where: { orderId: order.id } });
  return `${order.reference}-${n + 1}`;
}

export function newPayToken(): { token: string; tokenHash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, tokenHash: hashHoldToken(token) };
}

async function run<T>(
  fn: () => Promise<T>,
  fromInvites = false,
): Promise<T | { ok: false; error: EditError; ticketTypeId?: string }> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof EditFailure) {
      return { ok: false, error: error.code, ticketTypeId: error.ticketTypeId };
    }
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
      (error.code === "P2002" || error.code === "P2034")
    ) {
      return { ok: false, error: "retry" };
    }
    throw error;
  }
}

// ─────────────────────────────── Coordonnées

export async function updateOrderDetails(input: {
  orderId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  ticketNote: string;
  locale: string;
}): Promise<EditResult> {
  const { count } = await prisma.order.updateMany({
    where: { id: input.orderId, status: { in: ["PAID", "AWAITING_PAYMENT", "PENDING"] } },
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email.toLowerCase(),
      phone: input.phone || null,
      ticketNote: input.ticketNote || null,
      locale: input.locale,
    },
  });
  return count === 1 ? { ok: true } : { ok: false, error: "notEditable" };
}

// ─────────────────────────────── Places retirées

export async function removeOrderTickets(input: {
  orderId: string;
  ticketIds: string[];
  toInvites: boolean;
  refund: RefundSettle;
  actorId: string;
}): Promise<EditResult & { refundChargeId?: string }> {
  if (input.ticketIds.length === 0) return { ok: false, error: "empty" };
  const refund =
    input.refund.method !== "NONE" && input.refund.amountCents > 0
      ? input.refund
      : null;

  return run(() =>
    prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, input.orderId);
      assertEditable(order, true);
      if (
        refund?.method === "PROVIDER" &&
        !(
          order.payment?.status === "COMPLETED" &&
          REFUNDABLE_PROVIDERS.includes(order.payment.provider)
        )
      ) {
        throw new EditFailure("providerMissing");
      }

      await releaseTickets(tx, order, input.ticketIds, input.toInvites);

      let chargeId: string | undefined;
      if (refund) {
        const pendingRefunds = await tx.orderCharge.aggregate({
          where: { orderId: order.id, kind: "REFUND", status: { in: ["OPEN", "FAILED"] } },
          _sum: { amountCents: true },
        });
        const refundable = order.totalCents - (pendingRefunds._sum.amountCents ?? 0);
        if (refund.amountCents > refundable) throw new EditFailure("refundTooHigh");

        const cash = refund.method === "CASH";
        const charge = await tx.orderCharge.create({
          data: {
            orderId: order.id,
            number: await nextChargeNumber(tx, order),
            kind: "REFUND",
            method: refund.method,
            status: cash ? "DONE" : "OPEN",
            amountCents: refund.amountCents,
            currency: order.currency,
            provider: cash ? "cash" : null,
            ticketIds: input.ticketIds,
            createdById: input.actorId,
            settledAt: cash ? new Date() : null,
          },
          select: { id: true },
        });
        chargeId = charge.id;
        if (cash) {
          await tx.order.update({
            where: { id: order.id },
            data: { totalCents: { decrement: refund.amountCents } },
          });
        }
      }

      await closeIfEmpty(tx, order, input.ticketIds, refund !== null);
      return { ok: true as const, chargeId, refundChargeId: chargeId };
    }),
  );
}

// ─────────────────────────────── Places ajoutées

export async function addOrderTickets(input: {
  orderId: string;
  lines: { ticketTypeId: string; quantity: number }[];
  fromInvites: boolean;
  settle: PaymentSettle;
  actorId: string;
}): Promise<EditResult & { token?: string }> {
  const lines = input.lines.filter((l) => l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: "empty" };
  const settle = input.settle;
  if (settle.method === "LINK" && settle.amountCents <= 0) {
    return { ok: false, error: "amount" };
  }

  return run(
    () =>
      prisma.$transaction(async (tx) => {
        const order = await lockOrder(tx, input.orderId);
        assertEditable(order, true);
        const result = await addTicketsTx(tx, order, {
          lines,
          fromInvites: input.fromInvites,
          settle,
          actorId: input.actorId,
        });
        return { ok: true as const, ...result };
      }),
    input.fromInvites,
  );
}

/**
 * Prend le stock et les sièges, complète les lignes de la commande, émet les
 * billets et ouvre le règlement. Partagé avec la réservation saisie à l'admin.
 */
export async function addTicketsTx(
  tx: Prisma.TransactionClient,
  order: { id: string; reference: string; currency: string },
  input: {
    lines: { ticketTypeId: string; quantity: number }[];
    fromInvites: boolean;
    settle: PaymentSettle;
    actorId: string;
  },
): Promise<{ chargeId?: string; token?: string; ticketIds: string[] }> {
  const sessionIds = await tx.orderItem.findMany({
    where: { orderId: order.id },
    select: { ticketType: { select: { sessionId: true } } },
  });
  const allowed = new Set(sessionIds.map((i) => i.ticketType.sessionId));

  const types = await tx.ticketType.findMany({
    where: { id: { in: input.lines.map((l) => l.ticketTypeId) } },
    select: {
      id: true,
      priceCents: true,
      seatZones: true,
      sessionId: true,
      session: {
        select: {
          capacity: true,
          startsAt: true,
          seatPlan: { select: { layout: true } },
        },
      },
    },
  });
  const typeOf = new Map(types.map((t) => [t.id, t]));
  for (const line of input.lines) {
    const tt = typeOf.get(line.ticketTypeId);
    if (!tt || (allowed.size > 0 && !allowed.has(tt.sessionId))) {
      throw new EditFailure("notFound");
    }
    if (tt.session.startsAt <= new Date()) throw new EditFailure("sessionPast");
  }

  const bySession = new Map<string, typeof input.lines>();
  for (const line of input.lines) {
    const sid = typeOf.get(line.ticketTypeId)!.sessionId;
    bySession.set(sid, [...(bySession.get(sid) ?? []), line]);
  }

  const seatsByType = new Map<string, string[]>();
  for (const [sessionId, group] of bySession) {
    const session = typeOf.get(group[0]!.ticketTypeId)!.session;
    const layout = readLayout(session.seatPlan?.layout);
    if (input.fromInvites && !layout) await returnHeldToSale(tx, sessionId, group);
    await takeStock(
      tx,
      group.map((l) => ({ ...l, sessionId, capacity: session.capacity })),
    );
    if (!layout) continue;
    const got = await assignSeats(tx, {
      orderId: order.id,
      sessionId,
      layout,
      lines: group.map((l) => ({ ...l, zones: typeOf.get(l.ticketTypeId)!.seatZones })),
      fromInvites: input.fromInvites,
    });
    for (const [id, keys] of got) seatsByType.set(id, keys);
  }

  for (const line of input.lines) {
    const keys = seatsByType.get(line.ticketTypeId) ?? [];
    const existing = await tx.orderItem.findFirst({
      where: { orderId: order.id, ticketTypeId: line.ticketTypeId },
      select: { id: true, seatKeys: true },
    });
    if (existing) {
      await tx.orderItem.update({
        where: { id: existing.id },
        data: {
          quantity: { increment: line.quantity },
          seatKeys: [...existing.seatKeys, ...keys],
        },
      });
    } else {
      await tx.orderItem.create({
        data: {
          orderId: order.id,
          ticketTypeId: line.ticketTypeId,
          quantity: line.quantity,
          unitPriceCents: typeOf.get(line.ticketTypeId)!.priceCents,
          seatKeys: keys,
        },
      });
    }
  }

  const settle = input.settle;
  const items = await tx.orderItem.findMany({
    where: { orderId: order.id },
    select: { ticketTypeId: true, quantity: true, seatKeys: true },
  });
  const codes = await issueMissingTickets(
    tx,
    { id: order.id, items },
    settle.method === "LINK" ? "PENDING" : "VALID",
  );
  const ticketIds = (
    await tx.ticket.findMany({ where: { code: { in: codes } }, select: { id: true } })
  ).map((t) => t.id);

  const charge = await openPaymentCharge(tx, order, {
    settle,
    ticketIds,
    fromInvites: input.fromInvites,
    actorId: input.actorId,
  });
  return { ...charge, ticketIds };
}

/**
 * Règlement des billets émis : encaissé tout de suite en espèces, ou attendu
 * (lien de paiement, paiement sur place). Rien pour une place offerte.
 */
export async function openPaymentCharge(
  tx: Prisma.TransactionClient,
  order: { id: string; reference: string; currency: string },
  input: {
    settle: PaymentSettle;
    ticketIds: string[];
    fromInvites: boolean;
    actorId: string;
  },
): Promise<{ chargeId?: string; token?: string }> {
  const settle = input.settle;
  if (settle.method === "FREE" || settle.amountCents <= 0) return {};

  const method: ChargeMethod = settle.method;
  // Le terminal du point de vente encaisse sur le moment, comme les espèces.
  const cash = method === "CASH" || method === "TERMINAL";
  const link = settle.method === "LINK" ? newPayToken() : null;
  const charge = await tx.orderCharge.create({
    data: {
      orderId: order.id,
      number: await nextChargeNumber(tx, order),
      kind: "PAYMENT",
      method,
      status: cash ? "DONE" : "OPEN",
      amountCents: settle.amountCents,
      currency: order.currency,
      dueAt: settle.method === "LINK" ? settle.dueAt : null,
      tokenHash: link?.tokenHash ?? null,
      provider: cash ? (method === "TERMINAL" ? "terminal" : "cash") : null,
      ticketIds: input.ticketIds,
      fromInvites: input.fromInvites,
      createdById: input.actorId,
      settledAt: cash ? new Date() : null,
    },
    select: { id: true },
  });
  if (cash) {
    await tx.order.update({
      where: { id: order.id },
      data: { totalCents: { increment: settle.amountCents } },
    });
  }
  return { chargeId: charge.id, token: link?.token };
}

// ─────────────────────────────── Sièges déplacés

export async function moveOrderSeats(input: {
  orderId: string;
  sessionId: string;
  moves: { ticketId: string; to: string }[];
  toInvites: boolean;
}): Promise<EditResult> {
  if (input.moves.length === 0) return { ok: false, error: "empty" };
  const targets = new Set(input.moves.map((m) => m.to));
  if (targets.size !== input.moves.length) return { ok: false, error: "seatsUnavailable" };

  return run(() =>
    prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, input.orderId);
      assertEditable(order, false);

      const session = await tx.eventSession.findUnique({
        where: { id: input.sessionId },
        select: { seatPlan: { select: { layout: true } } },
      });
      const layout = readLayout(session?.seatPlan?.layout);
      if (!layout) throw new EditFailure("notFound");
      const seatOf = new Map(layout.seats.map((s) => [s.key, s]));
      await syncSessionSeats(input.sessionId, tx);

      const released: string[] = [];
      for (const move of input.moves) {
        const ticket = order.tickets.find((t) => t.id === move.ticketId);
        if (!ticket || !ticket.seatKey || !ACTIVE.includes(ticket.status)) {
          throw new EditFailure("notFound");
        }
        const item = order.items.find(
          (i) =>
            i.ticketTypeId === ticket.ticketTypeId &&
            i.ticketType.sessionId === input.sessionId,
        );
        const seat = seatOf.get(move.to);
        if (!item || !seat) throw new EditFailure("notFound");
        if (!zoneAllowed(item.ticketType.seatZones, seat.zone)) {
          throw new EditFailure("seatsUnavailable");
        }
        const got = await claimSeats(tx, {
          orderId: order.id,
          sessionId: input.sessionId,
          keys: [move.to],
          zones: item.ticketType.seatZones,
          from: ["AVAILABLE", "BLOCKED"],
        });
        if (got !== 1) throw new EditFailure("seatsUnavailable");

        const from = ticket.seatKey;
        released.push(from);
        await tx.ticket.update({
          where: { id: ticket.id },
          data: { seatKey: move.to, seatLabel: seatLabel(layout, move.to, order.locale) },
        });
        const fresh = await tx.orderItem.findUniqueOrThrow({
          where: { id: item.id },
          select: { seatKeys: true },
        });
        await tx.orderItem.update({
          where: { id: item.id },
          data: { seatKeys: fresh.seatKeys.map((k) => (k === from ? move.to : k)) },
        });
      }

      const stillMine = new Set(input.moves.map((m) => m.to));
      await releaseSeats(tx, {
        orderId: order.id,
        sessionId: input.sessionId,
        keys: released.filter((k) => !stillMine.has(k)),
        blockNote: input.toInvites ? invitesNote(order.reference) : null,
      });
      return { ok: true as const };
    }),
  );
}
