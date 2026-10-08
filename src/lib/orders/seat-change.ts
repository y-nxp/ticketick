import "server-only";

import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readLayout, type SeatLayout } from "@/lib/seating/layout";
import { claimSeats, syncSessionSeats } from "@/lib/seating/seats";
import { issueMissingTickets } from "@/lib/tickets/issue";
import type { Translated } from "@/lib/types";
import { hashHoldToken, takeStock } from "./create-order";
import {
  assertEditable,
  EditFailure,
  lockOrder,
  openPaymentCharge,
  releaseTickets,
  run,
  type EditError,
} from "./edit-order";
import {
  amountDue,
  newPriceCents,
  tariffForZone,
  type ChangeTariff,
} from "./seat-change-quote";

/**
 * Changement de places par le client, sur un lien envoyé depuis l'admin.
 *
 * Les nouvelles places remplacent les anciennes (nouveaux billets, nouveaux
 * codes). Sans différence à payer, le changement est immédiat. Sinon les
 * nouveaux billets attendent le paiement par carte : les anciens restent
 * valables jusque-là, et un lien abandonné ne change rien.
 */

const LINK_DAYS = 14;
const PAY_HOURS = 2;

export type ChangeError = EditError | "expired" | "used";

function newChangeToken(): { token: string; tokenHash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, tokenHash: hashHoldToken(token) };
}

export function changePath(token: string, locale: string): string {
  return `${locale === "fr" ? "" : `/${locale}`}/change/${encodeURIComponent(token)}`;
}

/** Billets que le client peut changer : valables, placés, séance à venir. */
function changeableWhere(orderId: string): Prisma.TicketWhereInput {
  return {
    orderId,
    status: "VALID",
    seatKey: { not: null },
    ticketType: { session: { startsAt: { gt: new Date() }, seatPlanId: { not: null } } },
  };
}

// ─────────────────────────────── Lien

/** Nouveau lien ; le précédent, s'il n'a pas servi, ne fonctionne plus. */
export async function createChangeLink(input: {
  orderId: string;
  actorId: string;
}): Promise<
  { ok: true; token: string; expiresAt: Date } | { ok: false; error: ChangeError }
> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: { status: true, resellerId: true },
  });
  if (!order) return { ok: false, error: "notFound" };
  if (order.status !== "PAID") return { ok: false, error: "notEditable" };
  if (order.resellerId) return { ok: false, error: "reseller" };

  const last = await prisma.ticket.findFirst({
    where: changeableWhere(input.orderId),
    orderBy: { ticketType: { session: { startsAt: "desc" } } },
    select: { ticketType: { select: { session: { select: { startsAt: true } } } } },
  });
  if (!last) return { ok: false, error: "empty" };

  const limit = new Date(Date.now() + LINK_DAYS * 24 * 3600 * 1000);
  const startsAt = last.ticketType.session.startsAt;
  const expiresAt = startsAt < limit ? startsAt : limit;
  const { token, tokenHash } = newChangeToken();
  await prisma.$transaction([
    prisma.orderChangeLink.deleteMany({ where: { orderId: input.orderId, usedAt: null } }),
    prisma.orderChangeLink.create({
      data: { orderId: input.orderId, tokenHash, expiresAt, createdById: input.actorId },
    }),
  ]);
  return { ok: true, token, expiresAt };
}

async function linkForToken(token: string) {
  if (!token) return null;
  return prisma.orderChangeLink.findUnique({
    where: { tokenHash: hashHoldToken(token) },
    select: { id: true, orderId: true, expiresAt: true, usedAt: true, createdById: true },
  });
}

function linkError(link: { expiresAt: Date; usedAt: Date | null }): ChangeError | null {
  if (link.usedAt) return "used";
  if (link.expiresAt <= new Date()) return "expired";
  return null;
}

// ─────────────────────────────── Page du client

export interface ChangeSession {
  id: string;
  eventTitle: Translated;
  startsAt: Date;
  venue: string | null;
  layout: SeatLayout;
  /** Sièges pris par d'autres commandes ou bloqués. */
  taken: string[];
  tariffs: (ChangeTariff & { name: Translated })[];
  tickets: {
    id: string;
    ticketTypeId: string;
    paidCents: number;
    seatKey: string;
    seatLabel: string | null;
  }[];
}

export type ChangePage =
  | { state: "invalid" }
  | { state: "used" | "expired"; locale: string; reference: string }
  | {
      state: "open";
      locale: string;
      reference: string;
      email: string;
      currency: string;
      expiresAt: Date;
      /** Une différence est déjà en attente de paiement : un nouveau choix l'annule. */
      pending: boolean;
      sessions: ChangeSession[];
    };

export async function changePageData(token: string): Promise<ChangePage> {
  const link = await linkForToken(token);
  if (!link) return { state: "invalid" };
  const order = await prisma.order.findUnique({
    where: { id: link.orderId },
    select: {
      id: true,
      reference: true,
      locale: true,
      email: true,
      currency: true,
      status: true,
      items: { select: { ticketTypeId: true, unitPriceCents: true } },
    },
  });
  if (!order || order.status !== "PAID") return { state: "invalid" };
  const closed = linkError(link);
  if (closed === "used" || closed === "expired") {
    return { state: closed, locale: order.locale, reference: order.reference };
  }

  const tickets = await prisma.ticket.findMany({
    where: changeableWhere(order.id),
    orderBy: [{ ticketType: { session: { startsAt: "asc" } } }, { seatKey: "asc" }],
    select: {
      id: true,
      ticketTypeId: true,
      seatKey: true,
      seatLabel: true,
      ticketType: { select: { sessionId: true } },
    },
  });
  const sessionIds = [...new Set(tickets.map((t) => t.ticketType.sessionId))];
  const sessions = await prisma.eventSession.findMany({
    where: { id: { in: sessionIds } },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      venue: { select: { name: true, city: true } },
      event: { select: { title: true } },
      seatPlan: { select: { layout: true } },
      ticketTypes: {
        select: {
          id: true,
          name: true,
          priceCents: true,
          seatZones: true,
          quantity: true,
          sold: true,
          maxPerPaidTicket: true,
          maxAgeYears: true,
        },
      },
    },
  });
  const taken = await prisma.sessionSeat.findMany({
    where: {
      sessionId: { in: sessionIds },
      status: { not: "AVAILABLE" },
      OR: [{ orderId: null }, { orderId: { not: order.id } }],
    },
    select: { sessionId: true, seatKey: true },
  });
  const paidOf = new Map(order.items.map((i) => [i.ticketTypeId, i.unitPriceCents]));
  const pending = await prisma.orderCharge.count({
    where: { orderId: order.id, status: "OPEN", NOT: { replacesTicketIds: { isEmpty: true } } },
  });

  const out: ChangeSession[] = [];
  for (const session of sessions) {
    const layout = readLayout(session.seatPlan?.layout);
    if (!layout) continue;
    out.push({
      id: session.id,
      eventTitle: session.event.title as Translated,
      startsAt: session.startsAt,
      venue: session.venue ? `${session.venue.name}, ${session.venue.city}` : null,
      layout,
      taken: taken.filter((s) => s.sessionId === session.id).map((s) => s.seatKey),
      tariffs: session.ticketTypes.map((t) => ({
        id: t.id,
        name: t.name as Translated,
        priceCents: t.priceCents,
        seatZones: t.seatZones,
        restricted: t.maxPerPaidTicket != null || t.maxAgeYears != null,
        available: t.sold < t.quantity,
      })),
      tickets: tickets
        .filter((t) => t.ticketType.sessionId === session.id)
        .map((t) => ({
          id: t.id,
          ticketTypeId: t.ticketTypeId,
          paidCents: paidOf.get(t.ticketTypeId) ?? 0,
          seatKey: t.seatKey!,
          seatLabel: t.seatLabel,
        })),
    });
  }

  return {
    state: "open",
    locale: order.locale,
    reference: order.reference,
    email: order.email,
    currency: order.currency,
    expiresAt: link.expiresAt,
    pending: pending > 0,
    sessions: out,
  };
}

// ─────────────────────────────── Changement

export type ChangeResult =
  | { ok: true; kind: "done"; orderId: string }
  | { ok: true; kind: "pay"; payToken: string; locale: string }
  | { ok: false; error: ChangeError };

export async function applySeatChange(input: {
  token: string;
  moves: { ticketId: string; to: string }[];
}): Promise<ChangeResult> {
  if (input.moves.length === 0) return { ok: false, error: "empty" };
  const targets = new Set(input.moves.map((m) => m.to));
  const sources = new Set(input.moves.map((m) => m.ticketId));
  if (targets.size !== input.moves.length || sources.size !== input.moves.length) {
    return { ok: false, error: "seatsUnavailable" };
  }
  const link = await linkForToken(input.token);
  if (!link) return { ok: false, error: "notFound" };
  const closed = linkError(link);
  if (closed) return { ok: false, error: closed };

  return run(() =>
    prisma.$transaction(async (tx) => {
      let order = await lockOrder(tx, link.orderId);
      assertEditable(order, true);
      const fresh = await tx.orderChangeLink.findUniqueOrThrow({
        where: { id: link.id },
        select: { usedAt: true },
      });
      if (fresh.usedAt) throw new EditFailure("notEditable");

      // Un choix précédent pas encore payé : ses places repartent en vente.
      const previous = await tx.orderCharge.findMany({
        where: {
          orderId: order.id,
          status: "OPEN",
          NOT: { replacesTicketIds: { isEmpty: true } },
        },
        select: { id: true, ticketIds: true },
      });
      for (const charge of previous) {
        const active = charge.ticketIds.filter((id) =>
          order.tickets.some((t) => t.id === id && t.status === "PENDING"),
        );
        if (active.length > 0) await releaseTickets(tx, order, active, false);
        await tx.orderCharge.update({
          where: { id: charge.id },
          data: { status: "CANCELLED", settledAt: new Date() },
        });
      }
      if (previous.length > 0) order = await lockOrder(tx, order.id);

      const old = await tx.ticket.findMany({
        where: { ...changeableWhere(order.id), id: { in: [...sources] } },
        select: {
          id: true,
          ticketTypeId: true,
          seatKey: true,
          attendeeName: true,
          attendeeBirthDate: true,
          ticketType: { select: { sessionId: true } },
        },
      });
      if (old.length !== sources.size) throw new EditFailure("notFound");
      const oldOf = new Map(old.map((t) => [t.id, t]));
      const ownSeats = new Set(old.map((t) => `${t.ticketType.sessionId}/${t.seatKey}`));
      const paidOf = new Map(order.items.map((i) => [i.ticketTypeId, i.unitPriceCents]));

      const sessionIds = [...new Set(old.map((t) => t.ticketType.sessionId))];
      const sessions = await tx.eventSession.findMany({
        where: { id: { in: sessionIds } },
        select: {
          id: true,
          capacity: true,
          seatPlan: { select: { layout: true } },
          ticketTypes: {
            select: {
              id: true,
              priceCents: true,
              seatZones: true,
              quantity: true,
              sold: true,
              maxPerPaidTicket: true,
              maxAgeYears: true,
            },
          },
        },
      });
      const sessionOf = new Map(sessions.map((s) => [s.id, s]));

      const plan: {
        move: { ticketId: string; to: string };
        sessionId: string;
        tariff: ChangeTariff;
        delta: number;
      }[] = [];
      for (const move of input.moves) {
        const ticket = oldOf.get(move.ticketId)!;
        const session = sessionOf.get(ticket.ticketType.sessionId);
        const layout = readLayout(session?.seatPlan?.layout);
        const seat = layout?.seats.find((s) => s.key === move.to);
        if (!session || !seat) throw new EditFailure("notFound");
        if (ownSeats.has(`${session.id}/${move.to}`)) throw new EditFailure("seatsUnavailable");
        const tariffs: ChangeTariff[] = session.ticketTypes.map((t) => ({
          id: t.id,
          priceCents: t.priceCents,
          seatZones: t.seatZones,
          restricted: t.maxPerPaidTicket != null || t.maxAgeYears != null,
          available: t.sold < t.quantity,
        }));
        const current = {
          id: ticket.id,
          ticketTypeId: ticket.ticketTypeId,
          paidCents: paidOf.get(ticket.ticketTypeId) ?? 0,
        };
        const tariff = tariffForZone(current, seat.zone, tariffs);
        if (!tariff) throw new EditFailure("seatsUnavailable");
        plan.push({
          move,
          sessionId: session.id,
          tariff,
          delta: newPriceCents(current, tariff) - current.paidCents,
        });
      }
      const due = amountDue(plan.map((p) => p.delta));
      const oldIds = [...sources];

      if (due === 0) {
        await releaseTickets(tx, order, oldIds, false);
      }

      for (const sessionId of sessionIds) {
        const session = sessionOf.get(sessionId)!;
        await syncSessionSeats(sessionId, tx);
        const byType = new Map<string, { tariff: ChangeTariff; keys: string[] }>();
        for (const p of plan.filter((x) => x.sessionId === sessionId)) {
          const entry = byType.get(p.tariff.id) ?? { tariff: p.tariff, keys: [] };
          entry.keys.push(p.move.to);
          byType.set(p.tariff.id, entry);
        }
        await takeStock(
          tx,
          [...byType.values()].map(({ tariff, keys }) => ({
            ticketTypeId: tariff.id,
            quantity: keys.length,
            sessionId,
            capacity: session.capacity,
          })),
        );
        for (const { tariff, keys } of byType.values()) {
          const got = await claimSeats(tx, {
            orderId: order.id,
            sessionId,
            keys,
            zones: tariff.seatZones,
          });
          if (got !== keys.length) throw new EditFailure("seatsUnavailable");
          const item = await tx.orderItem.findFirst({
            where: { orderId: order.id, ticketTypeId: tariff.id },
            select: { id: true, seatKeys: true },
          });
          if (item) {
            await tx.orderItem.update({
              where: { id: item.id },
              data: { quantity: { increment: keys.length }, seatKeys: [...item.seatKeys, ...keys] },
            });
          } else {
            await tx.orderItem.create({
              data: {
                orderId: order.id,
                ticketTypeId: tariff.id,
                quantity: keys.length,
                unitPriceCents: tariff.priceCents,
                seatKeys: keys,
              },
            });
          }
        }
      }

      const items = await tx.orderItem.findMany({
        where: { orderId: order.id },
        select: { ticketTypeId: true, quantity: true, seatKeys: true },
      });
      const codes = await issueMissingTickets(
        tx,
        { id: order.id, items },
        due > 0 ? "PENDING" : "VALID",
      );
      const issued = await tx.ticket.findMany({
        where: { code: { in: codes } },
        select: { id: true, seatKey: true, ticketType: { select: { sessionId: true } } },
      });
      for (const p of plan) {
        const ticket = oldOf.get(p.move.ticketId)!;
        const fresh = issued.find(
          (t) => t.seatKey === p.move.to && t.ticketType.sessionId === p.sessionId,
        );
        if (!fresh) throw new EditFailure("retry");
        if (ticket.attendeeName || ticket.attendeeBirthDate) {
          await tx.ticket.update({
            where: { id: fresh.id },
            data: {
              attendeeName: ticket.attendeeName,
              attendeeBirthDate: ticket.attendeeBirthDate,
            },
          });
        }
      }

      if (due === 0) {
        await tx.orderChangeLink.update({
          where: { id: link.id },
          data: { usedAt: new Date() },
        });
        return { ok: true as const, kind: "done" as const, orderId: order.id };
      }

      const charge = await openPaymentCharge(tx, order, {
        settle: {
          method: "LINK",
          amountCents: due,
          dueAt: new Date(Date.now() + PAY_HOURS * 3600 * 1000),
        },
        ticketIds: issued.map((t) => t.id),
        fromInvites: false,
        actorId: link.createdById ?? "",
      });
      if (!charge.chargeId || !charge.token) throw new EditFailure("retry");
      await tx.orderCharge.update({
        where: { id: charge.chargeId },
        data: { replacesTicketIds: oldIds },
      });
      return {
        ok: true as const,
        kind: "pay" as const,
        payToken: charge.token,
        locale: order.locale,
      };
    }),
  );
}

/**
 * Différence payée : les anciens billets sont rendus à la vente et le lien
 * de changement ne sert plus. Dans la transaction de l'encaissement.
 */
export async function releaseReplacedTickets(
  tx: Prisma.TransactionClient,
  orderId: string,
  ticketIds: string[],
): Promise<void> {
  const order = await lockOrder(tx, orderId);
  const active = ticketIds.filter((id) =>
    order.tickets.some((t) => t.id === id && (t.status === "VALID" || t.status === "PENDING")),
  );
  if (active.length > 0) await releaseTickets(tx, order, active, false);
  await tx.orderChangeLink.updateMany({
    where: { orderId, usedAt: null },
    data: { usedAt: new Date() },
  });
}
