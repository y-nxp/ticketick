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

export interface EventItem {
  id: string;
  slug: string;
  title: Translated;
  description: Translated;
  status: "DRAFT" | "PUBLISHED" | "CANCELLED" | "SOLD_OUT" | "PAST";
  featured: boolean;
  coverImage: string;
  gallery: string[];
  startsAt: string;
  endsAt?: string;
  doorsAt?: string;
  venue: Venue;
  organizer: Organizer;
  categories: Category[];
  ticketTypes: TicketType[];
  hasMap: boolean;
}

export function minPriceCents(event: EventItem): number {
  if (!event.ticketTypes.length) return 0;
  return Math.min(...event.ticketTypes.map((tt) => tt.priceCents));
}

export function isSoldOut(event: EventItem): boolean {
  if (event.status === "SOLD_OUT") return true;
  if (!event.ticketTypes.length) return false;
  return event.ticketTypes.every((tt) => tt.sold >= tt.quantity);
}
