import * as z from "zod";
import { zurichToUtc } from "@/lib/zurich-time";

/**
 * Schémas d'entrée de l'API publique, partagés par les routes REST, le
 * serveur MCP et la spécification OpenAPI : une seule définition, trois
 * présentations. Sans accès base, pour être testés seuls.
 */

const LANGS = ["fr", "en", "de", "it", "es"] as const;
type Lang = (typeof LANGS)[number];

/** Texte en plusieurs langues : au moins une. Le français sert de repli au site. */
export function translated(max: number, what: string) {
  return z
    .object({
      fr: z.string().trim().min(1).max(max).optional(),
      en: z.string().trim().min(1).max(max).optional(),
      de: z.string().trim().min(1).max(max).optional(),
      it: z.string().trim().min(1).max(max).optional(),
      es: z.string().trim().min(1).max(max).optional(),
    })
    .strict()
    .refine((v) => LANGS.some((l) => v[l]), { message: "at least one language is required" })
    .describe(
      `${what}, by language: { "fr": "…", "en": "…", "de": "…", "it": "…" }. At least one language; French is shown when a language is missing (if French is absent, the first given language takes its place).`,
    );
}

export type TranslatedInput = Partial<Record<Lang, string>>;

/** Stockage : `fr` est la langue de repli du site, toujours renseignée. */
export function toStoredText(value: TranslatedInput): Record<string, string> {
  const fr = value.fr ?? value.en ?? value.de ?? value.it ?? value.es ?? "";
  const out: Record<string, string> = { fr };
  for (const lang of LANGS) {
    if (lang !== "fr" && value[lang]) out[lang] = value[lang]!;
  }
  return out;
}

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/;

export const instant = z
  .string()
  .regex(INSTANT, "expected ISO 8601 date-time, e.g. 2026-12-05T20:00")
  .describe(
    "ISO 8601 date-time. Without offset it is Swiss local time (Europe/Zurich), e.g. 2026-12-05T20:00.",
  );

export function parseInstant(value: string): Date {
  const match = INSTANT.exec(value);
  if (match?.[1]) return new Date(value);
  return zurichToUtc(value.slice(0, 16));
}

export const price = z
  .number()
  .min(0)
  .max(100_000)
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "at most 2 decimals")
  .describe("Price in Swiss francs (CHF), e.g. 45 or 32.5. 0 for a free ticket.");

export function toCents(value: number): number {
  return Math.round(value * 100);
}

export const id = (what: string) => z.string().trim().min(1).max(40).describe(`${what} id`);

export const paymentInput = z
  .object({
    card: z.boolean().optional().describe("Card payment (default true)."),
    bankTransfer: z.boolean().optional().describe("Bank transfer / QR-bill (default true)."),
    paypal: z.boolean().optional().describe("PayPal, if the organizer has a PayPal account (default false)."),
  })
  .strict()
  .describe("Payment methods offered online. At least one when online sale is on.");

export const venueInput = z
  .object({
    name: z.string().trim().min(1).max(200),
    city: z.string().trim().min(1).max(120),
    address: z.string().trim().max(200).optional(),
    zip: z.string().trim().max(20).optional(),
    canton: z.string().trim().max(40).optional(),
    country: z.string().trim().length(2).optional().describe("ISO country code, default CH."),
  })
  .strict()
  .describe("Venue. An existing venue with the same name and city is reused, otherwise it is created.");

const ticketTypeFields = {
  name: translated(120, "Ticket type name (e.g. Full price, Student)"),
  description: translated(500, "Short ticket type description").optional(),
  price,
  quantity: z.number().int().min(1).max(100_000).describe("Number of tickets for sale at this price."),
  maxPerOrder: z.number().int().min(1).max(100).optional().describe("Maximum per order (default 10)."),
  salesStartAt: instant.optional().describe("Sales open at (optional). Same format as startsAt."),
  salesEndAt: instant.optional().describe("Sales close at (optional). Same format as startsAt."),
  requiresAttendee: z
    .boolean()
    .optional()
    .describe("Ask full name and birth date for each ticket (default false)."),
  maxAgeYears: z
    .number()
    .int()
    .min(1)
    .max(120)
    .optional()
    .describe("Reserved to people under this age on the day (e.g. 26). Requires requiresAttendee."),
};

export const ticketTypeInput = z.object(ticketTypeFields).strict();

const sessionFields = {
  startsAt: instant,
  endsAt: instant.optional(),
  doorsAt: instant.optional().describe("Doors open at (optional)."),
  label: translated(120, "Optional label to tell sessions apart (e.g. Matinee)").optional(),
  venueId: id("Existing venue (from list_venues)").optional(),
  venue: venueInput.optional(),
  capacity: z
    .number()
    .int()
    .min(1)
    .max(200_000)
    .optional()
    .describe("Venue capacity for this session, all ticket types together (optional)."),
};

export const sessionInput = z
  .object({
    ...sessionFields,
    ticketTypes: z.array(ticketTypeInput).max(20).optional().describe("Ticket types (prices) of this session."),
  })
  .strict();

const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(80)
  .describe("URL slug (optional, generated from the title).");

const eventFields = {
  title: translated(200, "Event title"),
  subtitle: translated(200, "Programme subtitle printed under the title").optional(),
  description: translated(10_000, "Description, plain text; blank lines separate paragraphs").optional(),
  tags: translated(300, "Comma-separated tags (e.g. Opera, Bel canto)").optional(),
  categories: z
    .array(z.string().trim().min(1).max(60))
    .max(10)
    .optional()
    .describe("Category slugs, from list_categories."),
  visibility: z
    .enum(["PUBLIC", "UNLISTED"])
    .optional()
    .describe("PUBLIC: listed on ticketick.ch and in search (default). UNLISTED: only on the organizer page and by direct link."),
  onlineSale: z
    .boolean()
    .optional()
    .describe("Sell tickets on ticketick (default true). false: information page only, with the contact below."),
  payment: paymentInput.optional(),
  contactEmail: z.email().max(200).optional(),
  contactPhone: z.string().regex(/^\+?[\d\s().\/-]{6,40}$/).optional(),
  contactUrl: z.url({ protocol: /^https?$/ }).max(300).optional(),
  coverImageUrl: z
    .url({ protocol: /^https$/ })
    .max(1000)
    .optional()
    .describe("HTTPS URL of a cover image (JPEG, PNG or WebP, max 4 MB). It is downloaded and stored by ticketick."),
};

const idempotencyKey = z
  .string()
  .min(8)
  .max(100)
  .optional()
  .describe("Optional unique key: sending the same request again with it returns the first result instead of creating a duplicate.");

export const schemas = {
  empty: z.object({}).strict(),
  listEvents: z
    .object({
      status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED", "SOLD_OUT", "PAST"]).optional(),
    })
    .strict(),
  eventRef: z.object({ eventId: id("Event") }).strict(),
  createEvent: z
    .object({
      ...eventFields,
      slug: slug.optional(),
      sessions: z.array(sessionInput).max(50).optional().describe("Dated sessions (performances) with their ticket types."),
      publish: z
        .boolean()
        .optional()
        .describe("Put the event online at once. Only with an API key allowed to publish; otherwise it stays a draft."),
      idempotencyKey,
    })
    .strict(),
  updateEvent: z
    .object({ eventId: id("Event"), ...eventFields })
    .partial()
    .required({ eventId: true })
    .strict(),
  addSession: z
    .object({ eventId: id("Event"), ...sessionInput.shape, idempotencyKey })
    .strict(),
  updateSession: z
    .object({
      sessionId: id("Session"),
      startsAt: instant.optional(),
      endsAt: instant.nullable().optional(),
      doorsAt: instant.nullable().optional(),
      label: translated(120, "Session label").nullable().optional(),
      venueId: id("Existing venue").optional(),
      venue: venueInput.optional(),
      capacity: z.number().int().min(1).max(200_000).nullable().optional(),
    })
    .strict(),
  sessionRef: z.object({ sessionId: id("Session") }).strict(),
  addTicketType: z
    .object({ sessionId: id("Session"), ...ticketTypeFields, idempotencyKey })
    .strict(),
  updateTicketType: z
    .object({
      ticketTypeId: id("Ticket type"),
      name: ticketTypeFields.name.optional(),
      description: ticketTypeFields.description,
      price: price.optional(),
      quantity: ticketTypeFields.quantity.optional(),
      maxPerOrder: ticketTypeFields.maxPerOrder,
      salesStartAt: instant.nullable().optional(),
      salesEndAt: instant.nullable().optional(),
    })
    .strict(),
  ticketTypeRef: z.object({ ticketTypeId: id("Ticket type") }).strict(),
  listVenues: z
    .object({ q: z.string().trim().max(100).optional().describe("Search in venue name or city.") })
    .strict(),
  searchPublic: z
    .object({
      q: z.string().trim().max(120).optional().describe("Free text: title, artist, organizer, venue, tags."),
      city: z.string().trim().max(120).optional(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("From date (YYYY-MM-DD), default today."),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Until date (YYYY-MM-DD), inclusive."),
      locale: z.enum(["fr", "en", "de", "it", "es"]).optional().describe("Language of texts and links (default fr)."),
      limit: z.coerce.number().int().min(1).max(100).optional().describe("Default 20."),
    })
    .strict(),
  publicEvent: z
    .object({
      slug: z.string().trim().min(1).max(120).describe("Event slug, from search_events."),
      locale: z.enum(["fr", "en", "de", "it", "es"]).optional(),
    })
    .strict(),
};

export type CreateEventInput = z.infer<typeof schemas.createEvent>;
export type UpdateEventInput = z.infer<typeof schemas.updateEvent>;
export type SessionInput = z.infer<typeof sessionInput>;
export type TicketTypeInput = z.infer<typeof ticketTypeInput>;
export type VenueInput = z.infer<typeof venueInput>;

/** Problèmes de validation lisibles par un agent : chemin et message. */
export function describeIssues(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((i) => ({
    path: i.path.map(String).join(".") || "(root)",
    message: i.message,
  }));
}
