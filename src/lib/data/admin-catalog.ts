import "server-only";

import { requireAdmin } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";

/**
 * Lectures du backoffice d'édition.
 *
 * Comme pour `lib/data/admin`, le contrôle des droits est porté par l'accès à
 * la donnée : une page ajoutée plus tard ne peut pas afficher le catalogue
 * complet en oubliant de se protéger.
 */

export async function getReferenceData() {
  await requireAdmin();

  const [organizers, venues, categories] = await Promise.all([
    prisma.organizer.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        description: true,
        website: true,
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
  ]);

  return { organizers, venues, categories };
}

export type ReferenceData = Awaited<ReturnType<typeof getReferenceData>>;

/** Spectacle complet pour l'écran d'édition, séances et tarifs compris. */
export async function getEventForEdit(id: string) {
  await requireAdmin();

  return prisma.event.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      status: true,
      visibility: true,
      featured: true,
      coverImage: true,
      organizerId: true,
      categories: { select: { id: true } },
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
          ticketTypes: {
            orderBy: { priceCents: "asc" },
            select: {
              id: true,
              name: true,
              priceCents: true,
              currency: true,
              quantity: true,
              sold: true,
              maxPerOrder: true,
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
