import "server-only";

import { catalogActor, forbidIfForeignEvent } from "@/lib/admin/access";
import { prisma } from "@/lib/prisma";
import { readLayout } from "@/lib/seating/layout";
import { syncSessionSeats } from "@/lib/seating/seats";

/**
 * Lectures du backoffice d'édition.
 *
 * Comme pour `lib/data/admin`, le contrôle des droits est porté par l'accès à
 * la donnée : une page ajoutée plus tard ne peut pas afficher le catalogue
 * complet en oubliant de se protéger.
 */

export async function getReferenceData() {
  const { organizerId } = await catalogActor();

  const [organizers, venues, categories, plans] = await Promise.all([
    prisma.organizer.findMany({
      where: organizerId ? { id: organizerId } : undefined,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        description: true,
        website: true,
        logoUrl: true,
        brandPrimary: true,
        brandAccent: true,
        brandBg: true,
        brandScheme: true,
        navLinks: true,
        notifyEmails: true,
        producerName: true,
        producerUrl: true,
        producerLogoUrl: true,
        ticketDisclaimer: true,
        user: { select: { email: true } },
        _count: { select: { events: true } },
      },
    }),
    prisma.venue.findMany({
      orderBy: [{ city: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        city: true,
        address: true,
        zip: true,
        canton: true,
        lat: true,
        lng: true,
        _count: { select: { sessions: true } },
      },
    }),
    prisma.category.findMany({
      orderBy: { slug: "asc" },
      select: {
        id: true,
        slug: true,
        name: true,
        color: true,
        _count: { select: { events: true } },
      },
    }),
    prisma.seatPlan.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, venueId: true, layout: true },
    }),
  ]);

  // Le plan complet pèse plusieurs centaines de sièges : les formulaires n'ont
  // besoin que des zones et du nombre de places.
  const seatPlans = plans.flatMap((p) => {
    const layout = readLayout(p.layout);
    if (!layout) return [];
    return [
      {
        id: p.id,
        name: p.name,
        venueId: p.venueId,
        seatCount: layout.seats.length,
        zones: layout.zones.map((z) => ({ key: z.key, name: z.name, color: z.color })),
      },
    ];
  });

  return { organizers, venues, categories, seatPlans };
}

export type ReferenceData = Awaited<ReturnType<typeof getReferenceData>>;

/** Spectacle complet pour l'écran d'édition, séances et tarifs compris. */
export async function getEventForEdit(id: string) {
  const { organizerId } = await catalogActor();
  await forbidIfForeignEvent(id, organizerId);

  return prisma.event.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      tags: true,
      status: true,
      visibility: true,
      featured: true,
      coverImage: true,
      acceptCard: true,
      acceptIban: true,
      acceptPaypal: true,
      onlineSale: true,
      contactEmail: true,
      contactPhone: true,
      contactUrl: true,
      organizerId: true,
      organizer: { select: { slug: true, name: true } },
      categories: { select: { id: true } },
      options: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          sessionId: true,
          enabled: true,
          title: true,
          hint: true,
          ticketTitle: true,
          priceCents: true,
          priceMode: true,
          sortOrder: true,
          groups: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              title: true,
              required: true,
              sortOrder: true,
              choices: {
                orderBy: { sortOrder: "asc" },
                select: { id: true, label: true, sortOrder: true },
              },
            },
          },
        },
      },
      sessions: {
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          label: true,
          startsAt: true,
          endsAt: true,
          doorsAt: true,
          status: true,
          venueId: true,
          seatPlanId: true,
          capacity: true,
          sold: true,
          acceptCard: true,
          acceptIban: true,
          ticketTypes: {
            orderBy: { priceCents: "desc" },
            select: {
              id: true,
              name: true,
              priceCents: true,
              currency: true,
              quantity: true,
              sold: true,
              maxPerOrder: true,
              maxPerPaidTicket: true,
              companionOfId: true,
              seatZones: true,
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

export type EventForEdit = NonNullable<Awaited<ReturnType<typeof getEventForEdit>>>;

/** Sièges d'une séance numérotée, pour le blocage des places invités. */
export async function getSessionSeats(eventId: string, sessionId: string) {
  const { organizerId } = await catalogActor();
  await forbidIfForeignEvent(eventId, organizerId);

  const session = await prisma.eventSession.findFirst({
    where: { id: sessionId, eventId },
    select: {
      id: true,
      startsAt: true,
      label: true,
      event: { select: { id: true, title: true } },
      seatPlan: { select: { layout: true } },
    },
  });
  const layout = readLayout(session?.seatPlan?.layout);
  if (!session || !layout) return null;

  await syncSessionSeats(session.id);
  const seats = await prisma.sessionSeat.findMany({
    where: { sessionId: session.id },
    select: {
      seatKey: true,
      zone: true,
      status: true,
      blockNote: true,
      order: { select: { id: true, reference: true, status: true } },
    },
  });
  return { session, layout, seats };
}

/** Séance, tarifs et réservations déjà saisies, pour réserver depuis l'admin. */
export async function getSessionForReservation(eventId: string, sessionId: string) {
  const { organizerId } = await catalogActor();
  await forbidIfForeignEvent(eventId, organizerId);

  const session = await prisma.eventSession.findFirst({
    where: { id: sessionId, eventId },
    select: {
      id: true,
      startsAt: true,
      label: true,
      capacity: true,
      sold: true,
      seatPlanId: true,
      seatPlan: { select: { layout: true } },
      venue: { select: { name: true, city: true } },
      event: { select: { id: true, title: true, organizerId: true } },
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
  if (!session) return null;

  const layout = readLayout(session.seatPlan?.layout);
  let freeByZone: Record<string, number> | null = null;
  let invitesByZone: Record<string, number> | null = null;
  if (layout) {
    await syncSessionSeats(session.id);
    const rows = await prisma.sessionSeat.groupBy({
      by: ["zone", "status"],
      where: { sessionId: session.id, status: { in: ["AVAILABLE", "BLOCKED"] } },
      _count: { _all: true },
    });
    const count = (status: string) =>
      Object.fromEntries(
        rows.filter((r) => r.status === status).map((r) => [r.zone, r._count._all]),
      );
    freeByZone = count("AVAILABLE");
    invitesByZone = count("BLOCKED");
  }

  // Saisies à l'admin, offertes ou payantes : seul ce canal les distingue.
  const reservations = await prisma.order.findMany({
    where: {
      channel: "BOX_OFFICE",
      items: { some: { ticketType: { sessionId: session.id } } },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      reference: true,
      status: true,
      lastName: true,
      ticketNote: true,
      createdAt: true,
      charges: {
        where: { kind: "PAYMENT", status: "OPEN" },
        select: { method: true },
      },
      _count: { select: { tickets: { where: { status: { not: "CANCELLED" } } } } },
    },
  });

  return { session, layout, freeByZone, invitesByZone, reservations };
}

/**
 * Rabais automatiques (sans code), ceux que la commande sait appliquer :
 * N séances payantes distinctes chez un organisateur, éventuellement dans un
 * même lieu.
 */
export async function getAutoDiscounts() {
  const { organizerId } = await catalogActor();
  return prisma.discount.findMany({
    where: {
      code: null,
      minDistinctSessions: { not: null },
      organizerId: organizerId ?? { not: null },
    },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      label: true,
      type: true,
      value: true,
      organizerId: true,
      venueId: true,
      minDistinctSessions: true,
      minAmountCents: true,
      validFrom: true,
      validUntil: true,
      active: true,
      organizer: { select: { name: true } },
      venue: { select: { name: true, city: true } },
      _count: { select: { orders: true } },
    },
  });
}

export type AutoDiscount = Awaited<ReturnType<typeof getAutoDiscounts>>[number];
