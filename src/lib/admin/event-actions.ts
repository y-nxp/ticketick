"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type EventStatus, type EventVisibility } from "@prisma/client";
import { catalogActor } from "@/lib/admin/access";
import { prisma } from "@/lib/prisma";
import { saveUploadedImage, UploadError } from "@/lib/uploads";
import {
  failure,
  readBoolean,
  readDateTime,
  readInteger,
  readMoneyCents,
  readOptionalDateTime,
  readOptionalText,
  readOverride,
  readText,
  readTranslated,
  slugify,
  success,
  type FormState,
} from "./form";

/**
 * Édition du catalogue : spectacles, séances, tarifs.
 *
 * Comme partout dans le backoffice, chaque action vérifie elle-même les
 * droits : elle est joignable indépendamment de la page qui l'affiche.
 *
 * Le fil conducteur des suppressions : rien qui porte une vente ne disparaît.
 * Un tarif déjà vendu, une séance dont des billets sont émis, un spectacle
 * rattaché à des commandes se dépublient mais ne s'effacent pas — sans quoi
 * on perdrait la trace comptable d'argent réellement encaissé.
 */

const STATUSES = [
  "DRAFT",
  "PUBLISHED",
  "CANCELLED",
  "SOLD_OUT",
  "PAST",
] as const satisfies readonly EventStatus[];

const VISIBILITIES = ["PUBLIC", "UNLISTED", "MEMBERS"] as const;

function readStatus(data: FormData, name: string): EventStatus | null {
  const value = readText(data, name);
  return (STATUSES as readonly string[]).includes(value)
    ? (value as EventStatus)
    : null;
}

function isDuplicate(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function refresh(eventId?: string) {
  revalidatePath("/admin/events");
  if (eventId) revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/");
}

// ─────────────────────────────── Spectacle

export async function saveEvent(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const { organizerId: scoped } = await catalogActor();

  const id = readOptionalText(data, "id");
  const title = readTranslated(data, "title");
  const description = readTranslated(data, "description");
  const organizerId = scoped ?? readText(data, "organizerId");
  const status = readStatus(data, "status");

  if (!title.fr) return failure("titleRequired");
  if (!organizerId) return failure("organizerRequired");
  if (!status) return failure("statusInvalid");

  const visibilityRaw = readText(data, "visibility");
  const visibility = (
    (VISIBILITIES as readonly string[]).includes(visibilityRaw)
      ? visibilityRaw
      : "PUBLIC"
  ) as EventVisibility;

  // Les cases non cochées ne sont pas transmises : la liste des catégories est
  // donc reconstruite à chaque enregistrement, `set` remplaçant l'ensemble.
  const categoryIds = data
    .getAll("categoryIds")
    .filter((v): v is string => typeof v === "string" && v !== "");

  const slug = readOptionalText(data, "slug") ?? slugify(title.fr);
  if (!slug) return failure("slugRequired");

  const acceptCard = readBoolean(data, "acceptCard");
  const acceptIban = readBoolean(data, "acceptIban");
  if (!acceptCard && !acceptIban) return failure("paymentRequired");

  if (id && scoped) {
    const current = await prisma.event.findUnique({
      where: { id },
      select: { organizerId: true },
    });
    if (!current || current.organizerId !== scoped) {
      return failure("forbiddenOrganizer");
    }
  }

  const fields = {
    title,
    description,
    organizerId,
    status,
    visibility,
    featured: readBoolean(data, "featured"),
    coverImage: readOptionalText(data, "coverImage") ?? null,
    acceptCard,
    acceptIban,
  };

  const liens = categoryIds.map((cid) => ({ id: cid }));

  try {
    const row = id
      ? await prisma.event.update({
          where: { id },
          // `set` remplace l'ensemble : décocher une catégorie doit la
          // détacher, ce qu'un `connect` ne ferait pas.
          data: { ...fields, slug, categories: { set: liens } },
        })
      : await prisma.event.create({
          data: { ...fields, slug, categories: { connect: liens } },
        });

    try {
      const cover = await saveUploadedImage(
        data.get("coverImageFile"),
        `events/${row.id}`,
      );
      if (cover) {
        await prisma.event.update({
          where: { id: row.id },
          data: { coverImage: cover },
        });
      }
    } catch (error) {
      if (error instanceof UploadError) return failure(error.key);
      throw error;
    }

    refresh(row.id);
    return success(row.id);
  } catch (error) {
    if (isDuplicate(error)) return failure("slugTaken");
    console.error("[admin] enregistrement spectacle", error);
    return failure("unavailable");
  }
}

export async function deleteEvent(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const { organizerId: scoped } = await catalogActor();
  const id = readText(data, "id");
  if (!id) return failure("notFound");
  if (scoped) {
    const current = await prisma.event.findUnique({
      where: { id },
      select: { organizerId: true },
    });
    if (!current || current.organizerId !== scoped) {
      return failure("forbiddenOrganizer");
    }
  }

  const vendus = await prisma.ticketType.aggregate({
    where: { session: { eventId: id } },
    _sum: { sold: true },
  });
  if ((vendus._sum.sold ?? 0) > 0) return failure("eventHasSales");

  try {
    // Les séances et leurs tarifs tombent en cascade (onDelete: Cascade) :
    // c'est voulu, ils n'ont pas d'existence hors du spectacle.
    await prisma.event.delete({ where: { id } });
    refresh();
    return success();
  } catch (error) {
    console.error("[admin] suppression spectacle", error);
    return failure("unavailable");
  }
}

// ─────────────────────────────── Séance

async function guardEvent(eventId: string, scoped: string | null) {
  if (!scoped) return true;
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { organizerId: true },
  });
  return event?.organizerId === scoped;
}

export async function saveSession(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const { organizerId: scoped } = await catalogActor();

  const id = readOptionalText(data, "id");
  const eventId = readText(data, "eventId");
  const startsAt = readDateTime(data, "startsAt");
  const status = readStatus(data, "status");

  if (!eventId) return failure("notFound");
  if (!(await guardEvent(eventId, scoped))) return failure("forbiddenOrganizer");
  if (!startsAt) return failure("startsAtRequired");
  if (!status) return failure("statusInvalid");

  const endsAt = readOptionalDateTime(data, "endsAt");
  const doorsAt = readOptionalDateTime(data, "doorsAt");

  if (endsAt === null) return failure("endsAtInvalid");
  if (doorsAt === null) return failure("doorsAtInvalid");
  if (endsAt && endsAt <= startsAt) return failure("endsBeforeStart");
  if (doorsAt && doorsAt > startsAt) return failure("doorsAfterStart");

  const label = readTranslated(data, "label");

  const capacityRaw = readText(data, "capacity");
  let capacity: number | null = null;
  if (capacityRaw !== "") {
    const n = readInteger(data, "capacity");
    if (n === null || n < 1) return failure("capacityInvalid");
    capacity = n;
  }
  if (id && capacity !== null) {
    const actuel = await prisma.eventSession.findUnique({
      where: { id },
      select: { sold: true },
    });
    if (actuel && capacity < actuel.sold) return failure("capacityBelowSold");
  }

  const acceptCard = readOverride(data, "acceptCard");
  const acceptIban = readOverride(data, "acceptIban");
  if (acceptCard === undefined || acceptIban === undefined) {
    return failure("paymentOverrideInvalid");
  }

  const spectacle = await prisma.event.findUnique({
    where: { id: eventId },
    select: { acceptCard: true, acceptIban: true },
  });
  if (!spectacle) return failure("notFound");
  const carte = acceptCard ?? spectacle.acceptCard;
  const virement = acceptIban ?? spectacle.acceptIban;
  if (!carte && !virement) return failure("paymentRequired");

  const fields = {
    startsAt,
    endsAt: endsAt ?? null,
    doorsAt: doorsAt ?? null,
    status,
    label: Object.keys(label).length > 0 ? label : Prisma.DbNull,
    venueId: readOptionalText(data, "venueId") ?? null,
    capacity,
    acceptCard,
    acceptIban,
  };

  try {
    const row = id
      ? await prisma.eventSession.update({ where: { id }, data: fields })
      : await prisma.eventSession.create({ data: { ...fields, eventId } });
    refresh(eventId);
    return success(row.id);
  } catch (error) {
    console.error("[admin] enregistrement séance", error);
    return failure("unavailable");
  }
}

export async function deleteSession(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const { organizerId: scoped } = await catalogActor();
  const id = readText(data, "id");
  if (!id) return failure("notFound");

  const session = await prisma.eventSession.findUnique({
    where: { id },
    select: { eventId: true, ticketTypes: { select: { sold: true } } },
  });
  if (!session) return failure("notFound");
  if (!(await guardEvent(session.eventId, scoped))) {
    return failure("forbiddenOrganizer");
  }

  const vendus = session.ticketTypes.reduce((n, t) => n + t.sold, 0);
  if (vendus > 0) return failure("sessionHasSales");

  try {
    await prisma.eventSession.delete({ where: { id } });
    refresh(session.eventId);
    return success();
  } catch (error) {
    console.error("[admin] suppression séance", error);
    return failure("unavailable");
  }
}

// ─────────────────────────────── Tarif

export async function saveTicketType(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const { organizerId: scoped } = await catalogActor();

  const id = readOptionalText(data, "id");
  const sessionId = readText(data, "sessionId");
  const name = readTranslated(data, "name");
  const priceCents = readMoneyCents(data, "price");
  const quantity = readInteger(data, "quantity");
  const maxPerOrder = readInteger(data, "maxPerOrder");
  const maxPerPaidRaw = readText(data, "maxPerPaidTicket");
  let maxPerPaidTicket: number | null = null;
  if (maxPerPaidRaw !== "") {
    const n = readInteger(data, "maxPerPaidTicket");
    if (n === null || n < 1) return failure("maxPerPaidInvalid");
    maxPerPaidTicket = n;
  }
  const companionOfId = readOptionalText(data, "companionOfId") ?? null;

  if (!sessionId) return failure("notFound");
  const seance = await prisma.eventSession.findUnique({
    where: { id: sessionId },
    select: { eventId: true },
  });
  if (!seance || !(await guardEvent(seance.eventId, scoped))) {
    return failure("forbiddenOrganizer");
  }
  if (!name.fr) return failure("nameRequired");
  if (priceCents === null) return failure("priceInvalid");
  if (quantity === null || quantity < 1) return failure("quantityInvalid");
  if (maxPerOrder === null || maxPerOrder < 1) return failure("maxInvalid");

  const salesStartAt = readOptionalDateTime(data, "salesStartAt");
  const salesEndAt = readOptionalDateTime(data, "salesEndAt");
  if (salesStartAt === null || salesEndAt === null) {
    return failure("salesWindowInvalid");
  }
  if (salesStartAt && salesEndAt && salesEndAt <= salesStartAt) {
    return failure("salesWindowInvalid");
  }

  // Le tarif source doit rester vendable et de la même séance, sinon la
  // gratuité ne se débloquerait jamais : la vente ne compte que les places
  // du tarif désigné dans le même panier.
  if (companionOfId) {
    if (maxPerPaidTicket === null) return failure("companionNeedsRatio");
    if (companionOfId === id) return failure("companionOfInvalid");
    const source = await prisma.ticketType.findUnique({
      where: { id: companionOfId },
      select: { sessionId: true, priceCents: true, maxPerPaidTicket: true },
    });
    if (
      !source ||
      source.sessionId !== sessionId ||
      source.priceCents <= 0 ||
      source.maxPerPaidTicket !== null
    ) {
      return failure("companionOfInvalid");
    }
  }

  // Le contingent ne peut pas descendre sous ce qui est déjà vendu : la
  // réservation compare `sold + n <= quantity`, et un contingent plus bas
  // fermerait la vente sans annuler les billets déjà émis.
  if (id) {
    const actuel = await prisma.ticketType.findUnique({
      where: { id },
      select: { sold: true },
    });
    if (actuel && quantity < actuel.sold) return failure("quantityBelowSold");
  }

  const fields = {
    name,
    description: Prisma.DbNull,
    priceCents,
    quantity,
    maxPerOrder,
    maxPerPaidTicket,
    companionOfId,
    salesStartAt: salesStartAt ?? null,
    salesEndAt: salesEndAt ?? null,
  };

  try {
    const row = id
      ? await prisma.ticketType.update({
          where: { id },
          // La description n'est pas éditée ici : la remettre à DbNull
          // effacerait une valeur saisie ailleurs.
          data: { ...fields, description: undefined },
        })
      : await prisma.ticketType.create({ data: { ...fields, sessionId } });

    const session = await prisma.eventSession.findUnique({
      where: { id: sessionId },
      select: { eventId: true },
    });
    refresh(session?.eventId);
    return success(row.id);
  } catch (error) {
    console.error("[admin] enregistrement tarif", error);
    return failure("unavailable");
  }
}

export async function deleteTicketType(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const { organizerId: scoped } = await catalogActor();
  const id = readText(data, "id");
  if (!id) return failure("notFound");

  const tarif = await prisma.ticketType.findUnique({
    where: { id },
    select: { sold: true, session: { select: { eventId: true } } },
  });
  if (!tarif) return failure("notFound");
  if (!(await guardEvent(tarif.session.eventId, scoped))) {
    return failure("forbiddenOrganizer");
  }
  if (tarif.sold > 0) return failure("ticketTypeHasSales");

  try {
    await prisma.ticketType.delete({ where: { id } });
    refresh(tarif.session.eventId);
    return success();
  } catch (error) {
    console.error("[admin] suppression tarif", error);
    return failure("unavailable");
  }
}
