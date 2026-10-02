import "server-only";

import { statsActor } from "@/lib/admin/access";
import { linkPaymentAvailable } from "@/lib/admin/charge-input";
import { REFUNDABLE_PROVIDERS } from "@/lib/orders/edit-order";
import { prisma } from "@/lib/prisma";
import { readLayout } from "@/lib/seating/layout";
import { syncSessionSeats } from "@/lib/seating/seats";
import { t as translate, type Translated } from "@/lib/types";
import { formatDate } from "@/lib/utils";

/** Plan d'une séance et billets placés de la commande, pour changer de places. */
export async function getOrderSeatContext(orderId: string, sessionId: string) {
  const { organizerId } = await statsActor();
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      items: {
        some: {
          ticketType: {
            sessionId,
            ...(organizerId ? { session: { event: { organizerId } } } : {}),
          },
        },
      },
    },
    select: {
      id: true,
      reference: true,
      status: true,
      tickets: {
        where: { status: { in: ["VALID", "PENDING"] }, ticketType: { sessionId } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          code: true,
          seatKey: true,
          attendeeName: true,
          ticketType: { select: { name: true, seatZones: true } },
        },
      },
    },
  });
  if (!order) return null;
  const session = await prisma.eventSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      startsAt: true,
      event: { select: { title: true } },
      seatPlan: { select: { layout: true } },
    },
  });
  const layout = readLayout(session?.seatPlan?.layout);
  if (!session || !layout) return null;
  await syncSessionSeats(session.id);
  const seats = await prisma.sessionSeat.findMany({
    where: { sessionId: session.id },
    select: { seatKey: true, zone: true, status: true },
  });
  return { order, session, layout, seats };
}

/**
 * De quoi modifier une commande depuis sa fiche : billets et leur prix,
 * règlements, tarifs des séances de la commande avec ce qui reste à vendre.
 */
export async function getOrderEditContext(orderId: string, locale: string) {
  const { organizerId } = await statsActor();
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      ...(organizerId
        ? { items: { some: { ticketType: { session: { event: { organizerId } } } } } }
        : {}),
    },
    select: {
      id: true,
      reference: true,
      status: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      ticketNote: true,
      locale: true,
      totalCents: true,
      currency: true,
      resellerId: true,
      payment: { select: { provider: true, status: true } },
      items: {
        select: {
          ticketTypeId: true,
          unitPriceCents: true,
          ticketType: { select: { sessionId: true } },
        },
      },
      tickets: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          code: true,
          ticketTypeId: true,
          status: true,
          seatLabel: true,
          attendeeName: true,
          ticketType: {
            select: {
              name: true,
              session: { select: { startsAt: true, event: { select: { title: true } } } },
            },
          },
        },
      },
      charges: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          number: true,
          kind: true,
          method: true,
          status: true,
          amountCents: true,
          dueAt: true,
          provider: true,
          ticketIds: true,
          createdAt: true,
          settledAt: true,
        },
      },
    },
  });
  if (!order) return null;

  const sessionIds = [...new Set(order.items.map((i) => i.ticketType.sessionId))];
  const sessions = await prisma.eventSession.findMany({
    where: { id: { in: sessionIds } },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      capacity: true,
      sold: true,
      event: { select: { title: true } },
      seatPlan: { select: { layout: true } },
      ticketTypes: {
        orderBy: { priceCents: "desc" },
        select: {
          id: true,
          name: true,
          priceCents: true,
          quantity: true,
          sold: true,
          seatZones: true,
        },
      },
    },
  });

  const tariffs = [];
  for (const session of sessions) {
    const layout = readLayout(session.seatPlan?.layout);
    const free: Record<string, number> = {};
    const invites: Record<string, number> = {};
    if (layout) {
      await syncSessionSeats(session.id);
      const rows = await prisma.sessionSeat.groupBy({
        by: ["zone", "status"],
        where: { sessionId: session.id, status: { in: ["AVAILABLE", "BLOCKED"] } },
        _count: { _all: true },
      });
      for (const r of rows) {
        const target = r.status === "AVAILABLE" ? free : invites;
        target[r.zone] = r._count._all;
      }
    }
    const allZones = layout?.zones.map((z) => z.key) ?? [];
    for (const tt of session.ticketTypes) {
      const zones = tt.seatZones.length ? tt.seatZones : allZones;
      const stock = Math.max(0, tt.quantity - tt.sold);
      const sum = (m: Record<string, number>) => zones.reduce((n, z) => n + (m[z] ?? 0), 0);
      tariffs.push({
        id: tt.id,
        sessionId: session.id,
        event: translate(session.event.title as Translated, locale),
        startsAt: session.startsAt,
        name: translate(tt.name as Translated, locale),
        priceCents: tt.priceCents,
        available: layout ? Math.min(stock, sum(free)) : stock,
        invites: layout ? sum(invites) : null,
      });
    }
  }

  const priceOf = new Map(order.items.map((i) => [i.ticketTypeId, i.unitPriceCents]));
  const openTickets = new Set(
    order.charges
      .filter((c) => c.kind === "PAYMENT" && c.status === "OPEN")
      .flatMap((c) => c.ticketIds),
  );

  return {
    order,
    tickets: order.tickets.map((t) => ({
      id: t.id,
      code: t.code,
      label: [
        ...(sessionIds.length > 1
          ? [
              translate(t.ticketType.session.event.title as Translated, locale),
              formatDate(t.ticketType.session.startsAt, `${locale}-CH`, { year: undefined }),
            ]
          : []),
        translate(t.ticketType.name as Translated, locale),
        t.seatLabel,
        t.attendeeName,
      ]
        .filter(Boolean)
        .join(" · "),
      status: t.status,
      priceCents: priceOf.get(t.ticketTypeId) ?? 0,
      unpaid: openTickets.has(t.id),
    })),
    tariffs,
    seatedSessions: sessions
      .filter((s) => readLayout(s.seatPlan?.layout))
      .map((s) => ({
        id: s.id,
        label: `${translate(s.event.title as Translated, locale)}`,
        startsAt: s.startsAt,
      })),
    providerRefund:
      order.payment?.status === "COMPLETED" &&
      REFUNDABLE_PROVIDERS.includes(order.payment.provider)
        ? order.payment.provider
        : null,
    linkAvailable: await linkPaymentAvailable(order.reference),
  };
}
