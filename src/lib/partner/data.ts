import "server-only";

import { prisma } from "@/lib/prisma";
import { publicAppOrigin } from "@/lib/app-url";
import { consume } from "@/lib/rate-limit";
import { sendOrderTicketsToBuyer } from "@/lib/email/ticket-mail";
import {
  emailsMatch,
  eventPageUrl,
  maskEmail,
  matchesDate,
  matchesText,
  normalizeEmail,
  normalizeReference,
  pick,
  plainText,
  remainingSeats,
  type PartnerLocale,
} from "./core";

/**
 * Lectures de l'API partenaire. `organizerId` restreint toujours le résultat
 * à un organisateur ; `null` signifie le numéro général de TICKETICK.
 */

const SALE_STATUSES = ["PUBLISHED", "SOLD_OUT"] as const;
const MAX_EVENTS = 8;

function visibleEventWhere(organizerId: string | null) {
  return organizerId
    ? { organizerId, status: { in: [...SALE_STATUSES] }, visibility: { not: "MEMBERS" as const } }
    : { status: { in: [...SALE_STATUSES] }, visibility: "PUBLIC" as const };
}

export async function listOrganizers() {
  const rows = await prisma.organizer.findMany({
    select: { id: true, slug: true, name: true },
    orderBy: { name: "asc" },
  });
  const origin = publicAppOrigin();
  return rows.map((o) => ({ ...o, shopUrl: `${origin}/go/${o.slug}` }));
}

export async function searchEvents(input: {
  organizerId: string | null;
  text: string | null;
  date: string | null;
  locale: PartnerLocale;
}) {
  const now = new Date();
  const rows = await prisma.event.findMany({
    where: {
      ...visibleEventWhere(input.organizerId),
      sessions: { some: { startsAt: { gte: now }, status: { not: "CANCELLED" } } },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      subtitle: true,
      tags: true,
      status: true,
      organizer: { select: { id: true, name: true } },
      sessions: {
        where: { startsAt: { gte: now }, status: { not: "CANCELLED" } },
        orderBy: { startsAt: "asc" },
        select: { startsAt: true, venue: { select: { name: true, city: true } } },
      },
    },
  });

  const origin = publicAppOrigin();
  return rows
    .filter((e) => {
      const starts = e.sessions.map((s) => s.startsAt);
      return (
        matchesText(
          {
            title: e.title as Record<string, string>,
            subtitle: e.subtitle as Record<string, string> | null,
            tags: e.tags as Record<string, string> | null,
            organizerName: e.organizer.name,
            venues: e.sessions.flatMap((s) => (s.venue ? [s.venue.name, s.venue.city] : [])),
            sessionStarts: starts,
          },
          input.text,
        ) && matchesDate(starts, input.date)
      );
    })
    .sort((a, b) => +a.sessions[0].startsAt - +b.sessions[0].startsAt)
    .slice(0, MAX_EVENTS)
    .map((e) => ({
      id: e.id,
      title: pick(e.title as Record<string, string>, input.locale),
      organizer: e.organizer.name,
      organizerId: e.organizer.id,
      soldOut: e.status === "SOLD_OUT",
      sessions: e.sessions.slice(0, 5).map((s) => ({
        startsAt: s.startsAt.toISOString(),
        venue: s.venue ? `${s.venue.name}, ${s.venue.city}` : null,
      })),
      url: eventPageUrl(origin, input.locale, e.slug),
    }));
}

async function loadEvent(id: string, organizerId: string | null) {
  return prisma.event.findFirst({
    where: { id, ...visibleEventWhere(organizerId) },
    select: {
      id: true,
      slug: true,
      title: true,
      subtitle: true,
      description: true,
      status: true,
      onlineSale: true,
      contactNote: true,
      organizerId: true,
      organizer: { select: { name: true, slug: true } },
      sessions: {
        where: { status: { not: "CANCELLED" }, startsAt: { gte: new Date() } },
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          label: true,
          startsAt: true,
          endsAt: true,
          doorsAt: true,
          status: true,
          capacity: true,
          sold: true,
          seatPlanId: true,
          venueId: true,
          venue: { select: { name: true, address: true, zip: true, city: true } },
          ticketTypes: {
            orderBy: { priceCents: "desc" },
            select: {
              id: true,
              name: true,
              description: true,
              priceCents: true,
              currency: true,
              quantity: true,
              sold: true,
              maxPerOrder: true,
              maxPerPaidTicket: true,
              companionOfId: true,
              requiresAttendee: true,
              maxAgeYears: true,
              salesStartAt: true,
              salesEndAt: true,
            },
          },
        },
      },
    },
  });
}

export async function eventDetails(id: string, organizerId: string | null, locale: PartnerLocale) {
  const event = await loadEvent(id, organizerId);
  if (!event) return null;
  const now = new Date();
  const sessionIds = event.sessions.map((s) => s.id);
  const venueIds = event.sessions.flatMap((s) => (s.venueId ? [s.venueId] : []));
  const discounts = await prisma.discount.findMany({
    where: {
      active: true,
      code: null,
      AND: [
        { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
        {
          OR: [
            { eventId: event.id },
            { sessionId: { in: sessionIds } },
            { organizerId: event.organizerId, eventId: null, sessionId: null },
          ],
        },
        { OR: [{ venueId: null }, { venueId: { in: venueIds } }] },
      ],
    },
    select: {
      label: true,
      type: true,
      value: true,
      minDistinctSessions: true,
      minQuantity: true,
      validFrom: true,
      validUntil: true,
    },
  });

  const origin = publicAppOrigin();
  return {
    id: event.id,
    title: pick(event.title as Record<string, string>, locale),
    subtitle: pick(event.subtitle as Record<string, string> | null, locale) || null,
    organizer: event.organizer.name,
    description: plainText(pick(event.description as Record<string, string>, locale)),
    onlineSale: event.onlineSale,
    soldOut: event.status === "SOLD_OUT",
    note: pick(event.contactNote as Record<string, string> | null, locale) || null,
    url: eventPageUrl(origin, locale, event.slug),
    sessions: event.sessions.map((s) => ({
      id: s.id,
      label: pick(s.label as Record<string, string> | null, locale) || null,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt?.toISOString() ?? null,
      doorsAt: s.doorsAt?.toISOString() ?? null,
      seating: s.seatPlanId ? "numbered" : "free",
      venue: s.venue
        ? {
            name: s.venue.name,
            address: [s.venue.address, [s.venue.zip, s.venue.city].filter(Boolean).join(" ")]
              .filter(Boolean)
              .join(", "),
          }
        : null,
      prices: s.ticketTypes.map((tt) => ({
        name: pick(tt.name as Record<string, string>, locale),
        description: pick(tt.description as Record<string, string> | null, locale) || null,
        priceChf: tt.priceCents / 100,
        currency: tt.currency,
        maxPerOrder: tt.maxPerOrder,
        maxPerPaidTicket: tt.maxPerPaidTicket,
        companion: tt.companionOfId != null,
        nameRequired: tt.requiresAttendee,
        maxAgeYears: tt.maxAgeYears,
        salesStartAt: tt.salesStartAt?.toISOString() ?? null,
        salesEndAt: tt.salesEndAt?.toISOString() ?? null,
      })),
    })),
    discounts: discounts.map((d) => ({
      label: pick(d.label as Record<string, string>, locale),
      kind: d.type === "PERCENTAGE" ? "percent" : "amount",
      value: d.type === "PERCENTAGE" ? d.value : d.value / 100,
      minDistinctSessions: d.minDistinctSessions,
      minQuantity: d.minQuantity,
      validFrom: d.validFrom?.toISOString() ?? null,
      validUntil: d.validUntil?.toISOString() ?? null,
    })),
  };
}

export async function eventAvailability(id: string, organizerId: string | null, locale: PartnerLocale) {
  const event = await loadEvent(id, organizerId);
  if (!event) return null;
  const now = new Date();
  return {
    id: event.id,
    title: pick(event.title as Record<string, string>, locale),
    onlineSale: event.onlineSale,
    sessions: event.sessions.map((s) => {
      const remaining =
        s.status === "SOLD_OUT" ? 0 : remainingSeats(s.ticketTypes, s.capacity, s.sold);
      return {
        id: s.id,
        startsAt: s.startsAt.toISOString(),
        remaining,
        soldOut: remaining === 0,
        prices: s.ticketTypes.map((tt) => ({
          name: pick(tt.name as Record<string, string>, locale),
          priceChf: tt.priceCents / 100,
          remaining: Math.max(0, tt.quantity - tt.sold),
          onSale:
            (!tt.salesStartAt || tt.salesStartAt <= now) && (!tt.salesEndAt || tt.salesEndAt > now),
        })),
      };
    }),
  };
}

function orderScope(organizerId: string | null) {
  return organizerId
    ? { items: { some: { ticketType: { session: { event: { organizerId } } } } } }
    : {};
}

/** Ne renvoie rien si la référence et l'e-mail ne vont pas ensemble. */
export async function lookupOrder(input: {
  reference: string;
  email: string;
  organizerId: string | null;
  locale: PartnerLocale;
}) {
  const order = await prisma.order.findFirst({
    where: { reference: normalizeReference(input.reference), ...orderScope(input.organizerId) },
    select: {
      id: true,
      reference: true,
      email: true,
      status: true,
      locale: true,
      createdAt: true,
      tickets: { where: { status: { in: ["VALID", "USED"] } }, select: { id: true } },
      items: {
        select: {
          quantity: true,
          ticketType: {
            select: {
              session: {
                select: {
                  startsAt: true,
                  event: { select: { title: true, organizer: { select: { name: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!order || !emailsMatch(order.email, input.email)) return null;

  const events = new Map<string, { title: string; startsAt: string; organizer: string }>();
  for (const item of order.items) {
    const session = item.ticketType.session;
    const title = pick(session.event.title as Record<string, string>, input.locale);
    events.set(`${title}|${session.startsAt.toISOString()}`, {
      title,
      startsAt: session.startsAt.toISOString(),
      organizer: session.event.organizer.name,
    });
  }
  return {
    orderId: order.id,
    reference: order.reference,
    status: order.status,
    paid: order.status === "PAID",
    maskedEmail: maskEmail(order.email),
    locale: order.locale,
    orderedAt: order.createdAt.toISOString(),
    ticketCount: order.tickets.length,
    canResend: order.status === "PAID" && order.tickets.length > 0,
    events: [...events.values()],
  };
}

export type ResendResult =
  | { ok: true; sent: boolean; maskedEmail: string }
  | { ok: false; reason: "not_found" | "not_paid" | "rate_limited" };

/** Renvoie les billets à l'adresse de la commande, jamais ailleurs. */
export async function resendOrderTickets(input: {
  orderId: string;
  email: string;
  organizerId: string | null;
}): Promise<ResendResult> {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, ...orderScope(input.organizerId) },
    select: { id: true, email: true, status: true },
  });
  if (!order || !emailsMatch(order.email, input.email)) return { ok: false, reason: "not_found" };
  if (order.status !== "PAID") return { ok: false, reason: "not_paid" };
  if (!consume(`partner-resend:${order.id}`, 3, 60 * 60_000)) {
    return { ok: false, reason: "rate_limited" };
  }
  const result = await sendOrderTicketsToBuyer(order.id);
  return { ok: true, sent: result.sent, maskedEmail: maskEmail(normalizeEmail(order.email)) };
}
