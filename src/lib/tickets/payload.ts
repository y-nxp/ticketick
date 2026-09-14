import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type VenueBits = {
  name: string;
  address?: string | null;
  zip?: string | null;
  city: string;
};

export interface TicketCard {
  code: string;
  eventTitle: string;
  organizerName: string;
  organizerLogoUrl?: string;
  ticketName: string;
  when: string;
  startTime: string;
  doorsTime?: string;
  venueLines: string[];
  venueInline: string;
  holderName: string;
  reference: string;
  priceLabel: string;
  priceCents: number;
  seating: string;
}

export function venueLines(venue?: VenueBits | null): string[] {
  if (!venue) return [];
  const lines = [venue.name];
  if (venue.address?.trim()) lines.push(venue.address.trim());
  const loc = [venue.zip, venue.city].filter(Boolean).join(" ");
  if (loc) lines.push(loc);
  return lines;
}

export function venueInline(venue?: VenueBits | null): string {
  return venueLines(venue).join(", ");
}

export function formatWhen(date: Date, locale: string): string {
  return plainSpaces(
    new Intl.DateTimeFormat(`${locale}-CH`, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date),
  );
}

export function formatClock(date: Date, locale: string): string {
  return plainSpaces(
    new Intl.DateTimeFormat(`${locale}-CH`, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date),
  );
}

function plainSpaces(text: string): string {
  return text.replace(/[\u00a0\u202f\u2007\u2009]/g, " ");
}

export function formatTicketPrice(
  cents: number,
  locale: string,
  currency = "CHF",
): string {
  if (cents <= 0) {
    if (locale === "de") return "Gratis";
    if (locale === "it") return "Gratuito";
    if (locale === "en") return "Free";
    return "Gratuit";
  }
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

export function readTitle(value: unknown, locale: string): string {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const hit = record[locale] ?? record.fr ?? Object.values(record)[0];
    if (typeof hit === "string") return hit;
  }
  return "";
}

/** Helvetica (WinAnsi) refuse œ, tirets longs, apostrophes courbes. */
export function pdfSafe(text: string): string {
  return text
    .replaceAll("œ", "oe")
    .replaceAll("Œ", "OE")
    .replaceAll("’", "'")
    .replaceAll("‘", "'")
    .replaceAll("“", '"')
    .replaceAll("”", '"')
    .replaceAll("—", "-")
    .replaceAll("–", "-")
    .replaceAll("…", "...")
    .replaceAll("\u00a0", " ");
}

export function toTicketCard(input: {
  code: string;
  eventTitle: unknown;
  ticketName: unknown;
  organizerName: string;
  organizerLogoUrl?: string | null;
  startsAt: Date;
  doorsAt?: Date | null;
  venue?: VenueBits | null;
  holderName: string;
  reference: string;
  priceCents: number;
  currency?: string;
  seatLabel?: string | null;
  locale: string;
}): TicketCard {
  return {
    code: input.code,
    eventTitle: readTitle(input.eventTitle, input.locale),
    organizerName: input.organizerName,
    organizerLogoUrl: input.organizerLogoUrl ?? undefined,
    ticketName: readTitle(input.ticketName, input.locale),
    when: formatWhen(input.startsAt, input.locale),
    startTime: formatClock(input.startsAt, input.locale),
    doorsTime: input.doorsAt
      ? formatClock(input.doorsAt, input.locale)
      : undefined,
    venueLines: venueLines(input.venue),
    venueInline: venueInline(input.venue),
    holderName: input.holderName,
    reference: input.reference,
    priceCents: input.priceCents,
    priceLabel: formatTicketPrice(
      input.priceCents,
      input.locale,
      input.currency ?? "CHF",
    ),
    seating: input.seatLabel?.trim() || seatingLabel(input.locale),
  };
}

function seatingLabel(locale: string): string {
  if (locale === "de") return "Freie Platzwahl";
  if (locale === "it") return "Posti non numerati";
  if (locale === "en") return "Free seating";
  return "Placement libre";
}

export async function readPublicFile(
  url?: string | null,
): Promise<Buffer | null> {
  if (!url?.startsWith("/")) return null;
  const safe = url.replaceAll("..", "").replace(/^\/+/, "");
  try {
    return await readFile(join(process.cwd(), "public", safe));
  } catch {
    return null;
  }
}
