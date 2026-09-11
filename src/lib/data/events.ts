import "server-only";

import { prisma } from "@/lib/prisma";
import type {
  Category,
  EventItem,
  EventStatus,
  EventVisibility,
  Organizer,
  SessionItem,
  TicketType,
  Translated,
  Venue,
} from "@/lib/types";

/**
 * Accès aux événements.
 *
 * Prisma renvoie les champs traduits en `Json` : on les convertit ici vers le
 * modèle d'affichage, afin que l'interface ne manipule jamais de `JsonValue`.
 */

/** Ce que Prisma doit charger pour construire un `EventItem` complet. */
const eventInclude = {
  organizer: true,
  categories: true,
  sessions: {
    include: {
      venue: true,
      seatMap: { select: { id: true } },
      ticketTypes: { orderBy: { priceCents: "asc" } },
    },
    orderBy: { startsAt: "asc" },
  },
} as const;

function translated(value: unknown): Translated {
  const v = (value ?? {}) as Partial<Translated>;
  const fr = v.fr ?? "";
  return { fr, en: v.en ?? fr, de: v.de ?? fr, it: v.it ?? fr };
}

function optionalTranslated(value: unknown): Translated | undefined {
  return value ? translated(value) : undefined;
}

type RawEvent = Awaited<
  ReturnType<typeof prisma.event.findFirstOrThrow<{ include: typeof eventInclude }>>
>;

function mapVenue(v: RawEvent["sessions"][number]["venue"]): Venue | undefined {
  if (!v) return undefined;
  return {
    id: v.id,
    name: v.name,
    address: v.address ?? undefined,
    city: v.city,
    canton: v.canton ?? undefined,
    country: v.country,
    lat: v.lat ?? undefined,
    lng: v.lng ?? undefined,
  };
}

function mapTicketType(
  tt: RawEvent["sessions"][number]["ticketTypes"][number],
): TicketType {
  return {
    id: tt.id,
    name: translated(tt.name),
    description: optionalTranslated(tt.description),
    priceCents: tt.priceCents,
    currency: tt.currency,
    quantity: tt.quantity,
    sold: tt.sold,
    maxPerOrder: tt.maxPerOrder,
    salesEndAt: tt.salesEndAt?.toISOString(),
  };
}

function mapSession(s: RawEvent["sessions"][number]): SessionItem {
  return {
    id: s.id,
    label: optionalTranslated(s.label),
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt?.toISOString(),
    doorsAt: s.doorsAt?.toISOString(),
    status: s.status as EventStatus,
    venue: mapVenue(s.venue),
    // Une carte n'est proposée que si le lieu est géolocalisé.
    hasMap: Boolean(s.seatMap) || Boolean(s.venue?.lat && s.venue?.lng),
    ticketTypes: s.ticketTypes.map(mapTicketType),
  };
}

function mapOrganizer(o: RawEvent["organizer"]): Organizer {
  return {
    id: o.id,
    slug: o.slug,
    name: o.name,
    logoUrl: o.logoUrl ?? undefined,
    friendsAppEnabled: o.friendsAppEnabled,
  };
}

function mapCategory(c: RawEvent["categories"][number]): Category {
  return {
    id: c.id,
    slug: c.slug,
    name: translated(c.name),
    color: c.color,
    icon: c.icon ?? undefined,
  };
}

function mapEvent(e: RawEvent): EventItem {
  return {
    id: e.id,
    slug: e.slug,
    title: translated(e.title),
    description: translated(e.description),
    status: e.status as EventStatus,
    visibility: e.visibility as EventVisibility,
    featured: e.featured,
    coverImage: e.coverImage ?? "",
    gallery: e.gallery,
    organizer: mapOrganizer(e.organizer),
    categories: e.categories.map(mapCategory),
    sessions: e.sessions.map(mapSession),
  };
}

/** Événements publiés et publics, les plus proches en premier. */
export async function getPublishedEvents(): Promise<EventItem[]> {
  const rows = await prisma.event.findMany({
    where: { status: "PUBLISHED", visibility: "PUBLIC" },
    include: eventInclude,
  });

  // Prisma ne sait pas trier un événement par la date de sa prochaine séance :
  // on le fait en mémoire, sur un catalogue de taille raisonnable.
  const now = Date.now();
  const nextStart = (e: EventItem) => {
    const upcoming = e.sessions
      .map((s) => +new Date(s.startsAt))
      .filter((d) => d >= now);
    return upcoming.length ? Math.min(...upcoming) : Number.MAX_SAFE_INTEGER;
  };

  return rows.map(mapEvent).sort((a, b) => nextStart(a) - nextStart(b));
}

export async function getFeaturedEvents(limit = 3): Promise<EventItem[]> {
  const all = await getPublishedEvents();
  return all.filter((e) => e.featured).slice(0, limit);
}

/**
 * Un événement par son slug. Les événements non listés restent accessibles
 * par lien direct ; seuls les brouillons sont masqués.
 */
export async function getEventBySlug(slug: string): Promise<EventItem | null> {
  const row = await prisma.event.findFirst({
    where: { slug, status: { not: "DRAFT" } },
    include: eventInclude,
  });
  return row ? mapEvent(row) : null;
}

export async function getCategories(): Promise<Category[]> {
  const rows = await prisma.category.findMany({ orderBy: { slug: "asc" } });
  return rows.map(mapCategory);
}

/** Villes proposant au moins une séance à venir. */
export async function getCities(): Promise<string[]> {
  const rows = await prisma.venue.findMany({
    where: { sessions: { some: { startsAt: { gte: new Date() } } } },
    select: { city: true },
    distinct: ["city"],
    orderBy: { city: "asc" },
  });
  return rows.map((r) => r.city);
}
