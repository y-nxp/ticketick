import "server-only";

import { prisma } from "@/lib/prisma";
import type { Translated } from "@/lib/types";
import { checkAttendees, type AttendeeError, type Holder } from "./attendees";
import {
  eventRulesSelect,
  markLinkUsed,
  resolveAccess,
  type ChangeAccess,
} from "./change-access";
import {
  addTicketsTx,
  assertEditable,
  closeIfEmpty,
  EditFailure,
  lockOrder,
  releaseTickets,
  run,
  type EditError,
} from "./edit-order";
import { allowedForChange, dropPendingChanges, PAY_HOURS } from "./seat-change";
import {
  cancelOpen,
  checkBasket,
  exchangeDue,
  type BasketError,
  type BasketTariff,
} from "./self-service-rules";

/**
 * Échange par le client : il rend des billets (ou aucun) et prend d'autres places, sur
 * un autre spectacle du même organisateur ou le même, éventuellement plus
 * nombreuses. Jamais de remboursement : il paie seulement la hausse. Sur un
 * plan de salle, il choisit ses sièges ; à défaut, ils sont attribués d'office.
 *
 * Annulation : places gratuites seulement, depuis le compte, pour libérer la
 * jauge quand le spectacle le permet.
 */

export type ExchangeError =
  | EditError
  | BasketError
  | "expired"
  | "attendeesMissing"
  | "attendeeInvalid"
  | "attendeeTooOld";

const ATTENDEE_ERRORS: Record<AttendeeError, ExchangeError> = {
  attendee_missing: "attendeesMissing",
  attendee_invalid: "attendeeInvalid",
  attendee_too_old: "attendeeTooOld",
};

export interface ExchangeTicket {
  id: string;
  ticketTypeId: string;
  sessionId: string;
  eventTitle: Translated;
  startsAt: Date;
  tariffName: Translated;
  seatKey: string | null;
  seatLabel: string | null;
  paidCents: number;
  /** Bénéficiaire inscrit : proposé d'avance pour les places nominatives. */
  holder: { name: string; birthDate: string } | null;
}

export interface ExchangeTarget {
  sessionId: string;
  eventTitle: Translated;
  coverImage: string;
  categories: { id: string; name: Translated; color: string }[];
  tags: Translated | null;
  startsAt: Date;
  venue: string | null;
  seated: boolean;
  tariffs: (BasketTariff & { name: Translated; maxAgeYears: number | null; seatZones: string[] })[];
}

export interface ExchangeOptions {
  tickets: ExchangeTicket[];
  targets: ExchangeTarget[];
}

function upcomingTicketsWhere(orderId: string) {
  return {
    orderId,
    status: "VALID" as const,
    ticketType: { session: { startsAt: { gt: new Date() } } },
  };
}

const ticketSelect = {
  id: true,
  ticketTypeId: true,
  seatKey: true,
  seatLabel: true,
  attendeeName: true,
  attendeeBirthDate: true,
  ticketType: {
    select: {
      name: true,
      sessionId: true,
      session: {
        select: {
          startsAt: true,
          event: { select: { title: true, organizerId: true, ...eventRulesSelect } },
        },
      },
    },
  },
} as const;

/** Séances en vente de l'organisateur, avec leurs tarifs ouverts. */
async function targetSessions(organizerIds: string[]): Promise<ExchangeTarget[]> {
  if (organizerIds.length === 0) return [];
  const now = new Date();
  const sessions = await prisma.eventSession.findMany({
    where: {
      status: "PUBLISHED",
      startsAt: { gt: now },
      event: { status: "PUBLISHED", onlineSale: true, organizerId: { in: organizerIds } },
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      capacity: true,
      sold: true,
      seatPlanId: true,
      venue: { select: { name: true, city: true } },
      event: {
        select: {
          title: true,
          coverImage: true,
          tags: true,
          categories: { select: { id: true, name: true, color: true } },
        },
      },
      ticketTypes: {
        orderBy: { priceCents: "desc" },
        select: {
          id: true,
          name: true,
          priceCents: true,
          quantity: true,
          sold: true,
          maxPerOrder: true,
          maxPerPaidTicket: true,
          companionOfId: true,
          requiresAttendee: true,
          maxAgeYears: true,
          seatZones: true,
          salesStartAt: true,
          salesEndAt: true,
        },
      },
    },
  });
  const out: ExchangeTarget[] = [];
  for (const session of sessions) {
    const room = session.capacity == null ? Infinity : Math.max(0, session.capacity - session.sold);
    const tariffs = session.ticketTypes
      .filter(
        (t) => (!t.salesStartAt || t.salesStartAt <= now) && (!t.salesEndAt || t.salesEndAt >= now),
      )
      .map((t) => ({
        id: t.id,
        name: t.name as Translated,
        priceCents: t.priceCents,
        available: Math.max(0, Math.min(t.quantity - t.sold, room)),
        maxPerOrder: t.maxPerOrder,
        maxPerPaidTicket: t.maxPerPaidTicket,
        companionOfId: t.companionOfId,
        requiresAttendee: t.requiresAttendee,
        maxAgeYears: t.maxAgeYears,
        seatZones: t.seatZones,
      }));
    if (tariffs.length === 0) continue;
    out.push({
      sessionId: session.id,
      eventTitle: session.event.title as Translated,
      coverImage: session.event.coverImage ?? "",
      categories: session.event.categories.map((c) => ({
        id: c.id,
        name: c.name as Translated,
        color: c.color,
      })),
      tags: (session.event.tags as Translated | null) ?? null,
      startsAt: session.startsAt,
      venue: session.venue ? `${session.venue.name}, ${session.venue.city}` : null,
      seated: session.seatPlanId != null,
      tariffs,
    });
  }
  return out;
}

export async function exchangeOptions(input: {
  orderId: string;
  viaAccount: boolean;
}): Promise<ExchangeOptions> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      status: true,
      resellerId: true,
      items: { select: { ticketTypeId: true, unitPriceCents: true } },
    },
  });
  if (!order || order.status !== "PAID" || order.resellerId) return { tickets: [], targets: [] };
  const tickets = allowedForChange(
    await prisma.ticket.findMany({
      where: upcomingTicketsWhere(input.orderId),
      orderBy: [{ ticketType: { session: { startsAt: "asc" } } }, { seatKey: "asc" }],
      select: ticketSelect,
    }),
    input.viaAccount,
  );
  if (tickets.length === 0) return { tickets: [], targets: [] };
  const paidOf = new Map(order.items.map((i) => [i.ticketTypeId, i.unitPriceCents]));
  const organizerIds = [...new Set(tickets.map((t) => t.ticketType.session.event.organizerId))];
  return {
    tickets: tickets.map((t) => ({
      id: t.id,
      ticketTypeId: t.ticketTypeId,
      sessionId: t.ticketType.sessionId,
      eventTitle: t.ticketType.session.event.title as Translated,
      startsAt: t.ticketType.session.startsAt,
      tariffName: t.ticketType.name as Translated,
      seatKey: t.seatKey,
      seatLabel: t.seatLabel,
      paidCents: paidOf.get(t.ticketTypeId) ?? 0,
      holder:
        t.attendeeName && t.attendeeBirthDate
          ? { name: t.attendeeName, birthDate: t.attendeeBirthDate.toISOString().slice(0, 10) }
          : null,
    })),
    targets: await targetSessions(organizerIds),
  };
}

export type ExchangeResult =
  | { ok: true; kind: "done"; orderId: string }
  | { ok: true; kind: "pay"; payToken: string; locale: string }
  | { ok: false; error: ExchangeError; ticketTypeId?: string };

export interface ExchangeItem {
  sessionId: string;
  /**
   * `seatKeys` : places choisies sur le plan, une par billet ; sinon attribuées
   * d'office. `attendees` : un bénéficiaire par billet nominatif, dans l'ordre
   * des places.
   */
  lines: {
    ticketTypeId: string;
    quantity: number;
    seatKeys?: string[];
    attendees?: { name: string; birthDate: string }[];
  }[];
}

/** Un panier : plusieurs spectacles possibles, une seule différence à payer. */
export async function applyExchange(input: {
  access: ChangeAccess;
  give: string[];
  items: ExchangeItem[];
}): Promise<ExchangeResult> {
  const give = [...new Set(input.give)];
  const items = input.items
    .map((item) => ({ ...item, lines: item.lines.filter((l) => l.quantity > 0) }))
    .filter((item) => item.lines.length > 0);
  if (items.length === 0) return { ok: false, error: "empty" };
  if (new Set(items.map((i) => i.sessionId)).size !== items.length) {
    return { ok: false, error: "notFound" };
  }
  const lines = items.flatMap((i) => i.lines);
  const chosen = lines.flatMap((l) => l.seatKeys ?? []);
  if (
    new Set(chosen).size !== chosen.length ||
    lines.some((l) => l.seatKeys && l.seatKeys.length !== l.quantity)
  ) {
    return { ok: false, error: "seatsUnavailable" };
  }
  const resolved = await resolveAccess(input.access);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const access = resolved.access;

  // Les spectacles proposés et le droit d'ajouter suivent les billets encore
  // modifiables de la commande, rendus ou non.
  const owned = allowedForChange(
    await prisma.ticket.findMany({
      where: upcomingTicketsWhere(access.orderId),
      select: ticketSelect,
    }),
    access.viaAccount,
  );
  if (owned.length === 0) return { ok: false, error: "notFound" };
  const given = owned.filter((t) => give.includes(t.id));
  if (given.length !== give.length) return { ok: false, error: "notFound" };
  const organizerIds = [...new Set(owned.map((t) => t.ticketType.session.event.organizerId))];
  const open = new Map((await targetSessions(organizerIds)).map((s) => [s.sessionId, s]));

  const tariffOf = new Map<string, ExchangeTarget["tariffs"][number]>();
  const assigned: { ticketTypeId: string; seatKey: string | null; holder: Holder }[] = [];
  for (const item of items) {
    const target = open.get(item.sessionId);
    if (!target) return { ok: false, error: "notFound" };
    if (item.lines.some((l) => l.seatKeys?.length) && !target.seated) {
      return { ok: false, error: "seatsUnavailable" };
    }
    // Places rendues sur cette séance : elles repartent en vente juste avant.
    const freed = new Map<string, number>();
    for (const t of given) {
      if (t.ticketType.sessionId === target.sessionId) {
        freed.set(t.ticketTypeId, (freed.get(t.ticketTypeId) ?? 0) + 1);
      }
    }
    const tariffs = target.tariffs.map((t) => ({
      ...t,
      available: t.available + (freed.get(t.id) ?? 0),
    }));
    const basket = checkBasket({ lines: item.lines, tariffs });
    if (!basket.ok) return basket;
    for (const t of tariffs) tariffOf.set(t.id, t);

    // Mêmes contrôles qu'au paiement sur le site ; l'âge au jour de la séance.
    const attendees = checkAttendees(
      tariffs.map((t) => ({
        id: t.id,
        requiresAttendee: t.requiresAttendee,
        maxAgeYears: t.maxAgeYears,
        sessionStartsAt: target.startsAt,
      })),
      new Map(item.lines.map((l) => [l.ticketTypeId, l.quantity])),
      item.lines.flatMap((l) => (l.attendees ?? []).map((a) => ({ ...a, ticketTypeId: l.ticketTypeId }))),
    );
    if (!attendees.ok) {
      return { ok: false, error: ATTENDEE_ERRORS[attendees.error], ticketTypeId: attendees.ticketTypeId };
    }
    for (const line of item.lines) {
      (attendees.byType.get(line.ticketTypeId) ?? []).forEach((holder, i) =>
        assigned.push({ ticketTypeId: line.ticketTypeId, seatKey: line.seatKeys?.[i] ?? null, holder }),
      );
    }
  }

  return run(() =>
    prisma.$transaction(async (tx) => {
      let order = await lockOrder(tx, access.orderId);
      assertEditable(order, true);
      if (await dropPendingChanges(tx, order.id)) order = await lockOrder(tx, order.id);
      const active = new Set(order.tickets.filter((t) => t.status === "VALID").map((t) => t.id));
      if (give.some((id) => !active.has(id))) throw new EditFailure("notFound");

      const paidOf = new Map(order.items.map((i) => [i.ticketTypeId, i.unitPriceCents]));
      const { dueCents } = exchangeDue({
        givenCents: given.map((t) => paidOf.get(t.ticketTypeId) ?? 0),
        lines: lines.map((l) => ({ priceCents: tariffOf.get(l.ticketTypeId)!.priceCents, quantity: l.quantity })),
      });

      if (dueCents === 0 && give.length > 0) {
        await releaseTickets(tx, order, give, false);
      }
      const added = await addTicketsTx(tx, order, {
        lines,
        fromInvites: false,
        anySession: true,
        settle:
          dueCents > 0
            ? {
                method: "LINK",
                amountCents: dueCents,
                dueAt: new Date(Date.now() + PAY_HOURS * 3600 * 1000),
              }
            : { method: "FREE" },
        actorId: access.actorId ?? "",
      });

      if (assigned.length > 0) {
        const fresh = await tx.ticket.findMany({
          where: { id: { in: added.ticketIds } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true, ticketTypeId: true, seatKey: true },
        });
        const used = new Set<string>();
        for (const { ticketTypeId, seatKey, holder } of assigned) {
          const ticket = fresh.find(
            (t) =>
              t.ticketTypeId === ticketTypeId &&
              !used.has(t.id) &&
              (seatKey == null || t.seatKey === seatKey),
          );
          if (!ticket) throw new EditFailure("retry");
          used.add(ticket.id);
          await tx.ticket.update({
            where: { id: ticket.id },
            data: { attendeeName: holder.name, attendeeBirthDate: holder.birthDate },
          });
        }
      }

      if (dueCents === 0) {
        await markLinkUsed(tx, access.linkId);
        return { ok: true as const, kind: "done" as const, orderId: order.id };
      }
      if (!added.chargeId || !added.token) throw new EditFailure("retry");
      await tx.orderCharge.update({
        where: { id: added.chargeId },
        data: { replacesTicketIds: give },
      });
      return {
        ok: true as const,
        kind: "pay" as const,
        payToken: added.token,
        locale: order.locale,
      };
    }),
  );
}

// ─────────────────────────────── Annulation des places gratuites

export interface CancellableTicket {
  id: string;
  eventTitle: Translated;
  startsAt: Date;
  tariffName: Translated;
  seatLabel: string | null;
  cancelUntil: Date;
}

/** Places gratuites que le client peut rendre depuis son compte. */
export async function cancellableTickets(orderId: string): Promise<CancellableTicket[]> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      resellerId: true,
      items: { select: { ticketTypeId: true, unitPriceCents: true } },
    },
  });
  if (!order || order.status !== "PAID" || order.resellerId) return [];
  const paidOf = new Map(order.items.map((i) => [i.ticketTypeId, i.unitPriceCents]));
  const tickets = await prisma.ticket.findMany({
    where: upcomingTicketsWhere(orderId),
    orderBy: [{ ticketType: { session: { startsAt: "asc" } } }, { seatKey: "asc" }],
    select: ticketSelect,
  });
  return tickets
    .filter((t) =>
      cancelOpen({
        startsAt: t.ticketType.session.startsAt,
        paidCents: paidOf.get(t.ticketTypeId) ?? 0,
        event: t.ticketType.session.event,
      }),
    )
    .map((t) => ({
      id: t.id,
      eventTitle: t.ticketType.session.event.title as Translated,
      startsAt: t.ticketType.session.startsAt,
      tariffName: t.ticketType.name as Translated,
      seatLabel: t.seatLabel,
      cancelUntil: new Date(
        t.ticketType.session.startsAt.getTime() -
          t.ticketType.session.event.cancelUntilHours * 3600 * 1000,
      ),
    }));
}

export async function cancelFreeTickets(input: {
  userId: string;
  orderId: string;
  ticketIds: string[];
}): Promise<{ ok: true } | { ok: false; error: EditError }> {
  const ids = [...new Set(input.ticketIds)];
  if (ids.length === 0) return { ok: false, error: "empty" };
  const resolved = await resolveAccess({ userId: input.userId, orderId: input.orderId });
  if (!resolved.ok) return { ok: false, error: "notFound" };
  const allowed = new Set((await cancellableTickets(input.orderId)).map((t) => t.id));
  if (ids.some((id) => !allowed.has(id))) return { ok: false, error: "notFound" };

  return run(() =>
    prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, input.orderId);
      assertEditable(order, true);
      await releaseTickets(tx, order, ids, false);
      await closeIfEmpty(tx, order, ids, false);
      return { ok: true as const };
    }),
  );
}
