import "server-only";

import { revalidatePath } from "next/cache";
import { Prisma, type EventStatus } from "@prisma/client";
import { slugify } from "@/lib/admin/form";
import { publicAppOrigin } from "@/lib/app-url";
import { getEventBySlug, getPublishedEvents } from "@/lib/data/events";
import { prisma } from "@/lib/prisma";
import { eventPath, localizedPath } from "@/lib/seo/event";
import {
  isSessionSoldOut,
  sessionMinPriceCents,
  sessionRemaining,
  t,
  type EventItem,
  type SessionItem,
} from "@/lib/types";
import { saveUploadedImage } from "@/lib/uploads";
import { toZurichLocal, zurichToUtc } from "@/lib/zurich-time";
import { ApiError, notFound } from "./errors";
import {
  parseInstant,
  toCents,
  toStoredText,
  type CreateEventInput,
  type SessionInput,
  type TicketTypeInput,
  type UpdateEventInput,
  type VenueInput,
} from "./input";
import { downloadCoverImage } from "./remote-image";

/**
 * Opérations de l'API publique, au nom de l'organisateur de la clé.
 *
 * Mêmes règles que l'admin (`lib/admin/event-actions`) : rien qui porte une
 * vente ne s'efface ni ne change de date. En plus, une clé sans le droit
 * « publier » ne touche qu'aux brouillons : un agent prépare, un humain met
 * en ligne.
 */

export type ApiActor = {
  keyId: string;
  keyName: string;
  keyPrefix: string;
  canPublish: boolean;
  organizerId: string;
  organizerName: string;
  organizerSlug: string;
};

const LIVE: EventStatus[] = ["PUBLISHED", "SOLD_OUT"];

const detailInclude = {
  organizer: { select: { slug: true } },
  categories: { select: { slug: true } },
  sessions: {
    orderBy: { startsAt: "asc" },
    include: { venue: true, ticketTypes: { orderBy: { priceCents: "desc" } } },
  },
} satisfies Prisma.EventInclude;

type EventRow = Prisma.EventGetPayload<{ include: typeof detailInclude }>;
type Tx = Prisma.TransactionClient;

function origin(): string {
  return publicAppOrigin();
}

function absolute(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith("/") ? `${origin()}${url}` : url;
}

function refresh(eventId?: string) {
  revalidatePath("/admin/events");
  if (eventId) revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/");
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

// ─────────────────────────────── Présentation

function serializeEvent(e: EventRow) {
  const path = eventPath({
    slug: e.slug,
    visibility: e.visibility,
    organizer: { slug: e.organizer.slug },
  } as Pick<EventItem, "slug" | "visibility" | "organizer">);
  return {
    id: e.id,
    slug: e.slug,
    status: e.status,
    live: LIVE.includes(e.status),
    visibility: e.visibility,
    title: e.title,
    subtitle: e.subtitle,
    description: e.description,
    tags: e.tags,
    categories: e.categories.map((c) => c.slug),
    onlineSale: e.onlineSale,
    payment: { card: e.acceptCard, bankTransfer: e.acceptIban, paypal: e.acceptPaypal },
    contactEmail: e.contactEmail,
    contactPhone: e.contactPhone,
    contactUrl: e.contactUrl,
    coverImage: absolute(e.coverImage),
    urls: {
      public: `${origin()}${path}`,
      admin: `${origin()}/admin/events/${e.id}`,
    },
    createdViaApi: e.apiKeyId != null,
    sessions: e.sessions.map((s) => ({
      id: s.id,
      startsAt: s.startsAt.toISOString(),
      startsAtLocal: toZurichLocal(s.startsAt),
      endsAt: iso(s.endsAt),
      doorsAt: iso(s.doorsAt),
      label: s.label,
      status: s.status,
      venue: s.venue
        ? {
            id: s.venue.id,
            name: s.venue.name,
            address: s.venue.address,
            zip: s.venue.zip,
            city: s.venue.city,
            country: s.venue.country,
          }
        : null,
      capacity: s.capacity,
      sold: s.sold,
      seated: s.seatPlanId != null,
      ticketTypes: s.ticketTypes.map((tt) => ({
        id: tt.id,
        name: tt.name,
        description: tt.description,
        price: tt.priceCents / 100,
        currency: tt.currency,
        quantity: tt.quantity,
        sold: tt.sold,
        maxPerOrder: tt.maxPerOrder,
        salesStartAt: iso(tt.salesStartAt),
        salesEndAt: iso(tt.salesEndAt),
        requiresAttendee: tt.requiresAttendee,
        maxAgeYears: tt.maxAgeYears,
      })),
    })),
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

async function loadEvent(actor: ApiActor, eventId: string, tx: Tx | typeof prisma = prisma) {
  const row = await tx.event.findFirst({
    where: { id: eventId, organizerId: actor.organizerId },
    include: detailInclude,
  });
  if (!row) throw notFound("Event");
  return row;
}

async function eventResult(actor: ApiActor, eventId: string) {
  return { event: serializeEvent(await loadEvent(actor, eventId)) };
}

/** Une clé sans droit de publication ne modifie que les brouillons. */
function assertWritable(actor: ApiActor, status: EventStatus) {
  if (status !== "DRAFT" && !actor.canPublish) {
    throw new ApiError(
      403,
      "publish_permission_required",
      "This event is not a draft. Changing it requires an API key with the publish permission (or use the ticketick admin).",
    );
  }
}

// ─────────────────────────────── Contrôles

function checkSessionDates(startsAt: Date, endsAt: Date | null, doorsAt: Date | null, at = "") {
  if (endsAt && endsAt <= startsAt) {
    throw new ApiError(422, "invalid_dates", `${at}endsAt must be after startsAt.`);
  }
  if (doorsAt && doorsAt > startsAt) {
    throw new ApiError(422, "invalid_dates", `${at}doorsAt must be before startsAt.`);
  }
}

function checkTicketType(
  v: { requiresAttendee?: boolean | null; maxAgeYears?: number | null; salesStartAt?: Date | null; salesEndAt?: Date | null },
  at = "",
) {
  if (v.maxAgeYears != null && !v.requiresAttendee) {
    throw new ApiError(422, "age_needs_attendee", `${at}maxAgeYears requires requiresAttendee: true.`);
  }
  if (v.salesStartAt && v.salesEndAt && v.salesEndAt <= v.salesStartAt) {
    throw new ApiError(422, "invalid_dates", `${at}salesEndAt must be after salesStartAt.`);
  }
}

function optionalInstant(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value === null ? null : parseInstant(value);
}

function ticketTypeData(tt: TicketTypeInput, at: string) {
  const salesStartAt = optionalInstant(tt.salesStartAt) ?? null;
  const salesEndAt = optionalInstant(tt.salesEndAt) ?? null;
  checkTicketType({ ...tt, salesStartAt, salesEndAt }, at);
  return {
    name: toStoredText(tt.name),
    description: tt.description ? toStoredText(tt.description) : Prisma.DbNull,
    priceCents: toCents(tt.price),
    quantity: tt.quantity,
    maxPerOrder: tt.maxPerOrder ?? 10,
    requiresAttendee: tt.requiresAttendee ?? false,
    maxAgeYears: tt.maxAgeYears ?? null,
    salesStartAt,
    salesEndAt,
  };
}

async function resolveVenue(
  tx: Tx,
  input: { venueId?: string; venue?: VenueInput },
): Promise<string | null | undefined> {
  if (input.venueId && input.venue) {
    throw new ApiError(422, "invalid_request", "Give either venueId or venue, not both.");
  }
  if (input.venueId) {
    const found = await tx.venue.findUnique({ where: { id: input.venueId }, select: { id: true } });
    if (!found) throw new ApiError(404, "not_found", "Venue not found. Use list_venues, or pass venue: { name, city }.");
    return found.id;
  }
  if (!input.venue) return undefined;
  const v = input.venue;
  const existing = await tx.venue.findFirst({
    where: {
      name: { equals: v.name, mode: "insensitive" },
      city: { equals: v.city, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await tx.venue.create({
    data: {
      name: v.name,
      city: v.city,
      address: v.address || null,
      zip: v.zip || null,
      canton: v.canton || null,
      country: (v.country ?? "CH").toUpperCase(),
    },
    select: { id: true },
  });
  return created.id;
}

async function createSession(tx: Tx, eventId: string, s: SessionInput, at: string) {
  const startsAt = parseInstant(s.startsAt);
  const endsAt = s.endsAt ? parseInstant(s.endsAt) : null;
  const doorsAt = s.doorsAt ? parseInstant(s.doorsAt) : null;
  checkSessionDates(startsAt, endsAt, doorsAt, at);
  const ticketTypes = (s.ticketTypes ?? []).map((tt, i) =>
    ticketTypeData(tt, `${at}ticketTypes.${i}: `),
  );
  const venueId = await resolveVenue(tx, s);
  return tx.eventSession.create({
    data: {
      eventId,
      startsAt,
      endsAt,
      doorsAt,
      label: s.label ? toStoredText(s.label) : Prisma.DbNull,
      venueId: venueId ?? null,
      capacity: s.capacity ?? null,
      ticketTypes: { create: ticketTypes },
    },
    select: { id: true },
  });
}

async function categoryIds(slugs: string[] | undefined) {
  if (!slugs) return undefined;
  const unique = [...new Set(slugs)];
  const rows = await prisma.category.findMany({
    where: { slug: { in: unique } },
    select: { id: true, slug: true },
  });
  const missing = unique.filter((s) => !rows.some((r) => r.slug === s));
  if (missing.length) {
    const all = await prisma.category.findMany({ select: { slug: true }, orderBy: { slug: "asc" } });
    throw new ApiError(422, "unknown_category", `Unknown categories: ${missing.join(", ")}.`, {
      validCategories: all.map((c) => c.slug),
    });
  }
  return rows.map((r) => ({ id: r.id }));
}

async function uniqueSlug(base: string): Promise<string> {
  const root = base || "evenement";
  for (let n = 1; n <= 50; n += 1) {
    const candidate = n === 1 ? root : `${root.slice(0, 74)}-${n}`;
    const taken = await prisma.event.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  return `${root.slice(0, 70)}-${Date.now().toString(36)}`;
}

/** Ce qu'il faut pour être en vente : une séance à venir et, en ligne, un tarif. */
function publishProblems(
  onlineSale: boolean,
  sessions: { startsAt: Date; status?: EventStatus; ticketTypes: number }[],
): string | null {
  const now = Date.now();
  const upcoming = sessions.filter((s) => s.startsAt.getTime() > now && s.status !== "CANCELLED");
  if (upcoming.length === 0) return "The event needs at least one upcoming session.";
  if (onlineSale && !upcoming.some((s) => s.ticketTypes > 0)) {
    return "With online sale, at least one upcoming session needs a ticket type.";
  }
  return null;
}

async function storeCover(eventId: string, file: File | null) {
  if (!file) return;
  const url = await saveUploadedImage(file, `events/${eventId}`);
  if (url) await prisma.event.update({ where: { id: eventId }, data: { coverImage: url } });
}

// ─────────────────────────────── Organisateur

export function whoami(actor: ApiActor) {
  return {
    organizer: {
      id: actor.organizerId,
      name: actor.organizerName,
      slug: actor.organizerSlug,
      page: `${origin()}/go/${actor.organizerSlug}`,
    },
    apiKey: { name: actor.keyName, prefix: actor.keyPrefix, canPublish: actor.canPublish },
    rules: [
      "Events are created as drafts. They go online with publish_event (or publish: true), only if canPublish is true.",
      actor.canPublish
        ? "This key may publish and change live events."
        : "This key may only change draft events; a person publishes them in the ticketick admin.",
      "Times without offset are Swiss local time (Europe/Zurich). Prices are in CHF.",
      "Nothing that has sold tickets can be deleted, and a session with sales cannot change date or venue.",
    ],
  };
}

export async function listEvents(actor: ApiActor, status?: EventStatus) {
  const rows = await prisma.event.findMany({
    where: { organizerId: actor.organizerId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      visibility: true,
      apiKeyId: true,
      sessions: {
        orderBy: { startsAt: "asc" },
        select: { startsAt: true, sold: true, status: true },
      },
    },
  });
  const now = Date.now();
  return {
    events: rows.map((e) => {
      const next = e.sessions.find((s) => s.startsAt.getTime() >= now && s.status !== "CANCELLED");
      return {
        id: e.id,
        slug: e.slug,
        title: e.title,
        status: e.status,
        visibility: e.visibility,
        sessions: e.sessions.length,
        nextSession: next ? toZurichLocal(next.startsAt) : null,
        ticketsSold: e.sessions.reduce((n, s) => n + s.sold, 0),
        createdViaApi: e.apiKeyId != null,
        adminUrl: `${origin()}/admin/events/${e.id}`,
      };
    }),
  };
}

export async function getEvent(actor: ApiActor, eventId: string) {
  return eventResult(actor, eventId);
}

export async function listVenues(actor: ApiActor, q?: string) {
  const rows = await prisma.venue.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
          ],
        }
      : { sessions: { some: { event: { organizerId: actor.organizerId } } } },
    orderBy: [{ city: "asc" }, { name: "asc" }],
    take: 50,
    select: { id: true, name: true, address: true, zip: true, city: true, country: true },
  });
  return { venues: rows };
}

export async function listCategories() {
  const rows = await prisma.category.findMany({
    orderBy: { slug: "asc" },
    select: { slug: true, name: true },
  });
  return { categories: rows };
}

// ─────────────────────────────── Spectacle

export async function createEvent(actor: ApiActor, input: CreateEventInput) {
  if (input.publish && !actor.canPublish) {
    throw new ApiError(
      403,
      "publish_permission_required",
      "This API key may not publish. Omit publish (the event is created as a draft) or ask the organizer for a key with the publish permission.",
    );
  }
  const card = input.payment?.card ?? true;
  const iban = input.payment?.bankTransfer ?? true;
  const paypal = input.payment?.paypal ?? false;
  const onlineSale = input.onlineSale ?? true;
  if (onlineSale && !card && !iban && !paypal) {
    throw new ApiError(422, "payment_required", "Online sale needs at least one payment method.");
  }

  const sessions = input.sessions ?? [];
  // Contrôles avant toute écriture : un appel refusé ne laisse rien derrière lui.
  sessions.forEach((s, i) => {
    const at = `sessions.${i}: `;
    checkSessionDates(
      parseInstant(s.startsAt),
      s.endsAt ? parseInstant(s.endsAt) : null,
      s.doorsAt ? parseInstant(s.doorsAt) : null,
      at,
    );
    (s.ticketTypes ?? []).forEach((tt, j) =>
      ticketTypeData(tt, `${at}ticketTypes.${j}: `),
    );
  });
  if (input.publish) {
    const problem = publishProblems(
      onlineSale,
      sessions.map((s) => ({ startsAt: parseInstant(s.startsAt), ticketTypes: s.ticketTypes?.length ?? 0 })),
    );
    if (problem) throw new ApiError(422, "not_publishable", problem);
  }
  const categories = await categoryIds(input.categories);
  const cover = input.coverImageUrl ? await downloadCoverImage(input.coverImageUrl) : null;

  const title = toStoredText(input.title);
  let slug: string;
  if (input.slug) {
    const taken = await prisma.event.findUnique({ where: { slug: input.slug }, select: { id: true } });
    if (taken) throw new ApiError(409, "slug_taken", `The slug "${input.slug}" is already used.`);
    slug = input.slug;
  } else {
    slug = await uniqueSlug(slugify(title.fr));
  }

  const eventId = await prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        slug,
        title,
        subtitle: input.subtitle ? toStoredText(input.subtitle) : Prisma.DbNull,
        description: input.description ? toStoredText(input.description) : { fr: "" },
        tags: input.tags ? toStoredText(input.tags) : Prisma.DbNull,
        status: input.publish ? "PUBLISHED" : "DRAFT",
        visibility: input.visibility ?? "PUBLIC",
        acceptCard: card,
        acceptIban: iban,
        acceptPaypal: paypal,
        onlineSale,
        contactEmail: input.contactEmail ?? null,
        contactPhone: input.contactPhone ?? null,
        contactUrl: input.contactUrl ?? null,
        organizerId: actor.organizerId,
        apiKeyId: actor.keyId,
        categories: categories ? { connect: categories } : undefined,
      },
      select: { id: true },
    });
    for (const [i, s] of sessions.entries()) {
      await createSession(tx, event.id, s, `sessions.${i}: `);
    }
    return event.id;
  });

  await storeCover(eventId, cover);
  refresh(eventId);
  return eventResult(actor, eventId);
}

export async function updateEvent(actor: ApiActor, input: UpdateEventInput) {
  const current = await loadEvent(actor, input.eventId);
  assertWritable(actor, current.status);

  const card = input.payment?.card ?? current.acceptCard;
  const iban = input.payment?.bankTransfer ?? current.acceptIban;
  const paypal = input.payment?.paypal ?? current.acceptPaypal;
  const onlineSale = input.onlineSale ?? current.onlineSale;
  if (onlineSale && !card && !iban && !paypal) {
    throw new ApiError(422, "payment_required", "Online sale needs at least one payment method.");
  }
  const categories = await categoryIds(input.categories);
  const cover = input.coverImageUrl ? await downloadCoverImage(input.coverImageUrl) : null;

  await prisma.event.update({
    where: { id: current.id },
    data: {
      title: input.title ? toStoredText(input.title) : undefined,
      subtitle: input.subtitle ? toStoredText(input.subtitle) : undefined,
      description: input.description ? toStoredText(input.description) : undefined,
      tags: input.tags ? toStoredText(input.tags) : undefined,
      visibility: input.visibility,
      onlineSale,
      acceptCard: card,
      acceptIban: iban,
      acceptPaypal: paypal,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      contactUrl: input.contactUrl,
      categories: categories ? { set: categories } : undefined,
    },
  });
  await storeCover(current.id, cover);
  refresh(current.id);
  return eventResult(actor, current.id);
}

export async function deleteEvent(actor: ApiActor, eventId: string) {
  const current = await loadEvent(actor, eventId);
  if (current.status !== "DRAFT") {
    throw new ApiError(409, "not_a_draft", "Only draft events can be deleted through the API.");
  }
  const sold = current.sessions.reduce((n, s) => n + s.ticketTypes.reduce((m, tt) => m + tt.sold, 0), 0);
  if (sold > 0) throw new ApiError(409, "event_has_sales", "This event has sold tickets and cannot be deleted.");
  await prisma.event.delete({ where: { id: current.id } });
  refresh();
  return { deleted: true, eventId: current.id };
}

export async function publishEvent(actor: ApiActor, eventId: string) {
  if (!actor.canPublish) {
    throw new ApiError(
      403,
      "publish_permission_required",
      "This API key may not publish. A person can publish the draft in the ticketick admin.",
    );
  }
  const current = await loadEvent(actor, eventId);
  if (!LIVE.includes(current.status)) {
    const problem = publishProblems(
      current.onlineSale,
      current.sessions.map((s) => ({ startsAt: s.startsAt, status: s.status, ticketTypes: s.ticketTypes.length })),
    );
    if (problem) throw new ApiError(422, "not_publishable", problem);
    await prisma.event.update({ where: { id: current.id }, data: { status: "PUBLISHED" } });
    refresh(current.id);
  }
  return eventResult(actor, current.id);
}

export async function unpublishEvent(actor: ApiActor, eventId: string) {
  if (!actor.canPublish) {
    throw new ApiError(403, "publish_permission_required", "This API key may not change the publication status.");
  }
  const current = await loadEvent(actor, eventId);
  const sold = current.sessions.reduce((n, s) => n + s.sold, 0);
  if (sold > 0) {
    throw new ApiError(
      409,
      "event_has_sales",
      "This event has sold tickets: take it offline from the ticketick admin, which handles the buyers.",
    );
  }
  await prisma.event.update({ where: { id: current.id }, data: { status: "DRAFT" } });
  refresh(current.id);
  return eventResult(actor, current.id);
}

// ─────────────────────────────── Séance

async function loadSession(actor: ApiActor, sessionId: string) {
  const row = await prisma.eventSession.findFirst({
    where: { id: sessionId, event: { organizerId: actor.organizerId } },
    include: { event: { select: { id: true, status: true } }, ticketTypes: { select: { sold: true } } },
  });
  if (!row) throw notFound("Session");
  return row;
}

export async function addSession(actor: ApiActor, input: SessionInput & { eventId: string }) {
  const event = await loadEvent(actor, input.eventId);
  assertWritable(actor, event.status);
  const created = await prisma.$transaction((tx) => createSession(tx, event.id, input, ""));
  refresh(event.id);
  return { sessionId: created.id, ...(await eventResult(actor, event.id)) };
}

export async function updateSession(
  actor: ApiActor,
  input: {
    sessionId: string;
    startsAt?: string;
    endsAt?: string | null;
    doorsAt?: string | null;
    label?: Record<string, string> | null;
    venueId?: string;
    venue?: VenueInput;
    capacity?: number | null;
  },
) {
  const current = await loadSession(actor, input.sessionId);
  assertWritable(actor, current.event.status);

  const startsAt = input.startsAt ? parseInstant(input.startsAt) : current.startsAt;
  const endsAt = optionalInstant(input.endsAt);
  const doorsAt = optionalInstant(input.doorsAt);
  checkSessionDates(
    startsAt,
    endsAt === undefined ? current.endsAt : endsAt,
    doorsAt === undefined ? current.doorsAt : doorsAt,
  );

  const venueChanges = input.venueId !== undefined || input.venue !== undefined;
  if (current.sold > 0 && (startsAt.getTime() !== current.startsAt.getTime() || venueChanges)) {
    throw new ApiError(
      409,
      "session_has_sales",
      "Tickets are sold for this session: its date and venue can only change through « Programme modifié » in the ticketick admin, which informs the buyers.",
    );
  }
  if (input.capacity !== undefined) {
    if (current.seatPlanId) {
      throw new ApiError(409, "seated_session", "The capacity of a seated session comes from its seat plan.");
    }
    if (input.capacity !== null && input.capacity < current.sold) {
      throw new ApiError(422, "capacity_below_sold", `Capacity cannot be below the ${current.sold} places already sold.`);
    }
  }

  await prisma.$transaction(async (tx) => {
    const venueId = venueChanges ? await resolveVenue(tx, input) : undefined;
    if (venueId !== undefined && current.seatPlanId) {
      throw new ApiError(409, "seated_session", "A seated session keeps the venue of its seat plan.");
    }
    await tx.eventSession.update({
      where: { id: current.id },
      data: {
        startsAt,
        endsAt,
        doorsAt,
        label: input.label === undefined ? undefined : input.label ? toStoredText(input.label) : Prisma.DbNull,
        venueId,
        capacity: input.capacity,
      },
    });
  });
  refresh(current.event.id);
  return eventResult(actor, current.event.id);
}

export async function deleteSession(actor: ApiActor, sessionId: string) {
  const current = await loadSession(actor, sessionId);
  assertWritable(actor, current.event.status);
  if (current.ticketTypes.some((tt) => tt.sold > 0)) {
    throw new ApiError(409, "session_has_sales", "This session has sold tickets and cannot be deleted.");
  }
  await prisma.eventSession.delete({ where: { id: current.id } });
  refresh(current.event.id);
  return eventResult(actor, current.event.id);
}

// ─────────────────────────────── Tarif

export async function addTicketType(actor: ApiActor, input: TicketTypeInput & { sessionId: string }) {
  const session = await loadSession(actor, input.sessionId);
  assertWritable(actor, session.event.status);
  const created = await prisma.ticketType.create({
    data: { ...ticketTypeData(input, ""), sessionId: session.id },
    select: { id: true },
  });
  refresh(session.event.id);
  return { ticketTypeId: created.id, ...(await eventResult(actor, session.event.id)) };
}

async function loadTicketType(actor: ApiActor, ticketTypeId: string) {
  const row = await prisma.ticketType.findFirst({
    where: { id: ticketTypeId, session: { event: { organizerId: actor.organizerId } } },
    include: { session: { select: { event: { select: { id: true, status: true } } } } },
  });
  if (!row) throw notFound("Ticket type");
  return row;
}

export async function updateTicketType(
  actor: ApiActor,
  input: {
    ticketTypeId: string;
    name?: Record<string, string>;
    description?: Record<string, string>;
    price?: number;
    quantity?: number;
    maxPerOrder?: number;
    salesStartAt?: string | null;
    salesEndAt?: string | null;
  },
) {
  const current = await loadTicketType(actor, input.ticketTypeId);
  const event = current.session.event;
  assertWritable(actor, event.status);
  if (input.quantity !== undefined && input.quantity < current.sold) {
    throw new ApiError(422, "quantity_below_sold", `Quantity cannot be below the ${current.sold} tickets already sold.`);
  }
  const salesStartAt = optionalInstant(input.salesStartAt);
  const salesEndAt = optionalInstant(input.salesEndAt);
  checkTicketType({
    requiresAttendee: current.requiresAttendee,
    maxAgeYears: current.maxAgeYears,
    salesStartAt: salesStartAt === undefined ? current.salesStartAt : salesStartAt,
    salesEndAt: salesEndAt === undefined ? current.salesEndAt : salesEndAt,
  });
  await prisma.ticketType.update({
    where: { id: current.id },
    data: {
      name: input.name ? toStoredText(input.name) : undefined,
      description: input.description ? toStoredText(input.description) : undefined,
      priceCents: input.price === undefined ? undefined : toCents(input.price),
      quantity: input.quantity,
      maxPerOrder: input.maxPerOrder,
      salesStartAt,
      salesEndAt,
    },
  });
  refresh(event.id);
  return eventResult(actor, event.id);
}

export async function deleteTicketType(actor: ApiActor, ticketTypeId: string) {
  const current = await loadTicketType(actor, ticketTypeId);
  const event = current.session.event;
  assertWritable(actor, event.status);
  if (current.sold > 0) {
    throw new ApiError(409, "ticket_type_has_sales", "This ticket type has sold tickets and cannot be deleted.");
  }
  await prisma.ticketType.delete({ where: { id: current.id } });
  refresh(event.id);
  return eventResult(actor, event.id);
}

// ─────────────────────────────── Catalogue public

function fold(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function publicUrl(event: EventItem, locale: string): string {
  return `${origin()}${localizedPath(eventPath(event), locale)}`;
}

function publicSession(s: SessionItem, locale: string) {
  const soldOut = isSessionSoldOut(s);
  return {
    id: s.id,
    startsAt: s.startsAt,
    startsAtLocal: toZurichLocal(new Date(s.startsAt)),
    label: s.label ? t(s.label, locale) : null,
    venue: s.venue
      ? { name: s.venue.name, address: s.venue.address ?? null, city: s.venue.city, country: s.venue.country }
      : null,
    status: soldOut ? "SOLD_OUT" : s.status,
    available: !soldOut && s.status !== "CANCELLED",
    remaining: s.ticketTypes.length ? sessionRemaining(s) : null,
    priceFrom: s.ticketTypes.length ? sessionMinPriceCents(s) / 100 : null,
    currency: "CHF",
    ticketTypes: s.ticketTypes.map((tt) => ({
      name: t(tt.name, locale),
      price: tt.priceCents / 100,
      available: tt.sold < tt.quantity,
    })),
  };
}

function publicEvent(event: EventItem, sessions: SessionItem[], locale: string, full: boolean) {
  const description = t(event.description, locale);
  const prices = sessions.flatMap((s) => s.ticketTypes.map((tt) => tt.priceCents)).filter((p) => p > 0);
  return {
    slug: event.slug,
    title: t(event.title, locale),
    description: full || description.length <= 500 ? description : `${description.slice(0, 497)}…`,
    organizer: { name: event.organizer.name, page: `${origin()}${localizedPath(`/go/${event.organizer.slug}`, locale)}` },
    categories: event.categories.map((c) => t(c.name, locale)),
    tags: event.tags ? t(event.tags, locale) : null,
    image: absolute(event.coverImage),
    url: publicUrl(event, locale),
    onlineSale: event.onlineSale && !event.salesPaused,
    priceFrom: prices.length ? Math.min(...prices) / 100 : null,
    currency: "CHF",
    sessions: sessions.map((s) => publicSession(s, locale)),
  };
}

function dayStart(day: string): Date {
  return zurichToUtc(`${day}T00:00`);
}

export async function searchPublicEvents(input: {
  q?: string;
  city?: string;
  from?: string;
  to?: string;
  locale?: string;
  limit?: number;
}) {
  const locale = input.locale ?? "fr";
  const from = input.from ? dayStart(input.from) : new Date();
  const to = input.to ? new Date(dayStart(input.to).getTime() + 86_400_000) : null;
  const words = fold(input.q ?? "").split(/\s+/).filter(Boolean);
  const city = input.city ? fold(input.city) : null;

  const events = await getPublishedEvents();
  const results = [];
  for (const event of events) {
    const sessions = event.sessions
      .filter((s) => s.status !== "CANCELLED")
      .filter((s) => new Date(s.startsAt) >= from && (!to || new Date(s.startsAt) < to))
      .filter((s) => !city || (s.venue && fold(s.venue.city).includes(city)))
      .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
    if (sessions.length === 0) continue;
    if (words.length) {
      const haystack = fold(
        [
          ...Object.values(event.title),
          ...(event.tags ? Object.values(event.tags) : []),
          ...event.categories.flatMap((c) => Object.values(c.name)),
          event.organizer.name,
          ...sessions.flatMap((s) => [s.venue?.name ?? "", s.venue?.city ?? ""]),
          t(event.description, "fr"),
          t(event.description, locale),
        ].join(" "),
      );
      if (!words.every((w) => haystack.includes(w))) continue;
    }
    results.push(publicEvent(event, sessions, locale, false));
  }
  const limit = input.limit ?? 20;
  return { total: results.length, events: results.slice(0, limit) };
}

export async function getPublicEvent(slug: string, locale = "fr") {
  const event = await getEventBySlug(slug);
  if (!event || event.visibility === "MEMBERS") {
    throw new ApiError(404, "not_found", "No public event with this slug.");
  }
  const now = new Date();
  const sessions = event.sessions
    .filter((s) => new Date(s.startsAt) >= now && s.status !== "CANCELLED")
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  return { event: publicEvent(event, sessions, locale, true) };
}
