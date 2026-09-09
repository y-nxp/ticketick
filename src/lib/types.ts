export type Translated = {
  fr: string;
  en: string;
  de: string;
  it: string;
};

export function t(value: Translated, locale: string): string {
  return (
    value[locale as keyof Translated] ??
    value.fr ??
    Object.values(value)[0] ??
    ""
  );
}

export type EventStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "CANCELLED"
  | "SOLD_OUT"
  | "PAST";

export type EventVisibility = "PUBLIC" | "UNLISTED" | "MEMBERS";

export interface Category {
  id: string;
  slug: string;
  name: Translated;
  color: string;
  icon?: string;
}

export interface Venue {
  id: string;
  name: string;
  address?: string;
  city: string;
  canton?: string;
  country: string;
  lat?: number;
  lng?: number;
}

export interface TicketType {
  id: string;
  name: Translated;
  description?: Translated;
  priceCents: number;
  currency: string;
  quantity: number;
  sold: number;
  maxPerOrder: number;
  salesEndAt?: string;
}

export interface Organizer {
  id: string;
  slug: string;
  name: string;
  logoUrl?: string;
  friendsAppEnabled: boolean;
}

/**
 * Une représentation datée. Porte le lieu, le plan de salle et l'inventaire :
 * deux séances d'un même spectacle peuvent avoir des tarifs ou des salles
 * différents.
 */
export interface SessionItem {
  id: string;
  label?: Translated;
  startsAt: string;
  endsAt?: string;
  doorsAt?: string;
  status: EventStatus;
  venue?: Venue;
  hasMap: boolean;
  ticketTypes: TicketType[];
}

/** L'œuvre. Les dates, lieux et stocks vivent sur ses sessions. */
export interface EventItem {
  id: string;
  slug: string;
  title: Translated;
  description: Translated;
  status: EventStatus;
  visibility: EventVisibility;
  featured: boolean;
  coverImage: string;
  gallery: string[];
  organizer: Organizer;
  categories: Category[];
  sessions: SessionItem[];
}

// ── Dérivations
//
// Un événement n'a pas de date ni de prix propres : ces valeurs se déduisent
// de ses sessions. Ces helpers centralisent ces calculs pour que l'interface
// n'ait pas à les refaire.

export function isSessionSoldOut(session: SessionItem): boolean {
  if (session.status === "SOLD_OUT") return true;
  if (!session.ticketTypes.length) return false;
  return session.ticketTypes.every((tt) => tt.sold >= tt.quantity);
}

export function sessionRemaining(session: SessionItem): number {
  return session.ticketTypes.reduce(
    (sum, tt) => sum + Math.max(0, tt.quantity - tt.sold),
    0,
  );
}

export function sessionMinPriceCents(session: SessionItem): number {
  if (!session.ticketTypes.length) return 0;
  return Math.min(...session.ticketTypes.map((tt) => tt.priceCents));
}

/** Sessions encore à venir, dans l'ordre chronologique. */
export function upcomingSessions(
  event: EventItem,
  now: Date = new Date(),
): SessionItem[] {
  return event.sessions
    .filter((s) => new Date(s.startsAt) >= now && s.status !== "CANCELLED")
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
}

/**
 * Séance de référence pour l'affichage : la prochaine à venir, ou à défaut la
 * plus récente si l'événement est entièrement passé.
 */
export function nextSession(
  event: EventItem,
  now: Date = new Date(),
): SessionItem | undefined {
  return (
    upcomingSessions(event, now)[0] ??
    event.sessions
      .slice()
      .sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt))[0]
  );
}

/** Prix d'appel, toutes séances confondues. */
export function minPriceCents(event: EventItem): number {
  const prices = event.sessions
    .flatMap((s) => s.ticketTypes.map((tt) => tt.priceCents))
    .filter((p) => Number.isFinite(p));
  return prices.length ? Math.min(...prices) : 0;
}

export function isSoldOut(event: EventItem): boolean {
  if (event.status === "SOLD_OUT") return true;
  if (!event.sessions.length) return false;
  return event.sessions.every(isSessionSoldOut);
}

/** Villes distinctes où l'événement est joué. */
export function eventCities(event: EventItem): string[] {
  return [
    ...new Set(
      event.sessions
        .map((s) => s.venue?.city)
        .filter((c): c is string => Boolean(c)),
    ),
  ];
}
