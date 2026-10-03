"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type EventStatus, type EventVisibility } from "@prisma/client";
import { catalogActor } from "@/lib/admin/access";
import { prisma } from "@/lib/prisma";
import { readLayout } from "@/lib/seating/layout";
import { syncSessionSeats } from "@/lib/seating/seats";
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
  const tags = readTranslated(data, "tags");
  const contactNote = readTranslated(data, "contactNote");
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
  const acceptPaypal = readBoolean(data, "acceptPaypal");
  const onlineSale = readBoolean(data, "onlineSale");
  if (onlineSale && !acceptCard && !acceptIban && !acceptPaypal) {
    return failure("paymentRequired");
  }

  const contactEmail = readOptionalText(data, "contactEmail") ?? null;
  const contactPhone = readOptionalText(data, "contactPhone") ?? null;
  if (
    contactEmail &&
    (contactEmail.length > 200 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))
  ) {
    return failure("emailInvalid");
  }
  if (contactPhone && !/^\+?[\d\s().\/-]{6,40}$/.test(contactPhone)) {
    return failure("phoneInvalid");
  }
  const contactUrl = readOptionalText(data, "contactUrl") ?? null;
  if (contactUrl && (contactUrl.length > 300 || !isWebUrl(contactUrl))) {
    return failure("urlInvalid");
  }

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
    tags: tags.fr ? tags : Prisma.DbNull,
    organizerId,
    status,
    visibility,
    featured: readBoolean(data, "featured"),
    coverImage: readOptionalText(data, "coverImage") ?? null,
    acceptCard,
    acceptIban,
    acceptPaypal,
    onlineSale,
    contactEmail,
    contactPhone,
    contactUrl,
    contactNote: contactNote.fr ? contactNote : Prisma.DbNull,
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

/**
 * « Publier sur ticketick » : un spectacle public figure sur l'accueil et
 * dans la recherche ; retiré, il reste en vente sur la page de
 * l'organisateur et par lien direct. La diffusion « membres » ne se change
 * pas d'ici.
 */
export async function setEventListed(
  eventId: unknown,
  listed: unknown,
): Promise<FormState> {
  const { organizerId: scoped } = await catalogActor();
  if (typeof eventId !== "string" || typeof listed !== "boolean") {
    return failure("invalid");
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { organizerId: true, visibility: true },
  });
  if (!event || (scoped && event.organizerId !== scoped)) return failure("notFound");
  if (event.visibility === "MEMBERS") return failure("members");

  await prisma.event.update({
    where: { id: eventId },
    data: { visibility: listed ? "PUBLIC" : "UNLISTED" },
  });
  refresh(eventId);
  return success(eventId);
}

const BULK_ACTIONS = ["publish", "draft", "list", "unlist", "delete"] as const;
export type BulkEventAction = (typeof BULK_ACTIONS)[number];
export type BulkEventResult =
  | { ok: true; done: number; skipped: number }
  | { ok: false; error: string };

/**
 * Actions groupées de la liste des spectacles. Chaque spectacle hors de
 * portée ou non concerné est compté comme ignoré plutôt que de faire
 * échouer le lot : on ne publie qu'un brouillon, on ne dépublie qu'un
 * spectacle publié, la diffusion « membres » ne bouge pas, et rien qui porte
 * une vente n'est supprimé.
 */
export async function bulkEventAction(
  ids: unknown,
  action: unknown,
): Promise<BulkEventResult> {
  const { organizerId: scoped } = await catalogActor();
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > 500 ||
    !ids.every((id): id is string => typeof id === "string") ||
    !(BULK_ACTIONS as readonly unknown[]).includes(action)
  ) {
    return { ok: false, error: "invalid" };
  }
  const where: Prisma.EventWhereInput = {
    id: { in: [...new Set(ids)] },
    ...(scoped ? { organizerId: scoped } : {}),
  };
  const total = new Set(ids).size;

  let done = 0;
  switch (action as BulkEventAction) {
    case "publish":
      done = (
        await prisma.event.updateMany({
          where: { ...where, status: "DRAFT" },
          data: { status: "PUBLISHED" },
        })
      ).count;
      break;
    case "draft":
      done = (
        await prisma.event.updateMany({
          where: { ...where, status: "PUBLISHED" },
          data: { status: "DRAFT" },
        })
      ).count;
      break;
    case "list":
    case "unlist": {
      const visibility = action === "list" ? "PUBLIC" : "UNLISTED";
      done = (
        await prisma.event.updateMany({
          where: { ...where, visibility: { notIn: ["MEMBERS", visibility] } },
          data: { visibility },
        })
      ).count;
      break;
    }
    case "delete": {
      const deletable = await prisma.event.findMany({
        where: {
          ...where,
          sessions: { none: { ticketTypes: { some: { sold: { gt: 0 } } } } },
        },
        select: { id: true },
      });
      for (const { id } of deletable) {
        try {
          await prisma.event.delete({ where: { id } });
          done += 1;
        } catch (error) {
          console.error("[admin] suppression groupée", id, error);
        }
      }
      break;
    }
  }

  refresh();
  return { ok: true, done, skipped: total - done };
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
  const actuel = id
    ? await prisma.eventSession.findFirst({
        where: { id, eventId },
        select: { sold: true, seatPlanId: true },
      })
    : null;
  if (id && !actuel) return failure("notFound");
  if (actuel && capacity !== null && capacity < actuel.sold) {
    return failure("capacityBelowSold");
  }

  const venueId = readOptionalText(data, "venueId") ?? null;
  const seatPlanId = readOptionalText(data, "seatPlanId") ?? null;
  const planChanged = (actuel?.seatPlanId ?? null) !== seatPlanId;
  // Les billets déjà vendus portent (ou non) une place : changer de plan les
  // rendrait incohérents avec la salle.
  if (planChanged && actuel && actuel.sold > 0) {
    return failure("seatPlanHasSales");
  }
  if (seatPlanId) {
    const plan = await prisma.seatPlan.findUnique({
      where: { id: seatPlanId },
      select: { venueId: true, layout: true },
    });
    const layout = readLayout(plan?.layout);
    if (!plan || !layout) return failure("seatPlanInvalid");
    if (plan.venueId !== venueId) return failure("seatPlanVenueMismatch");
    if (capacity === null) capacity = layout.seats.length;
    if (capacity > layout.seats.length) return failure("capacityAbovePlan");
  }

  const acceptCard = readOverride(data, "acceptCard");
  const acceptIban = readOverride(data, "acceptIban");
  if (acceptCard === undefined || acceptIban === undefined) {
    return failure("paymentOverrideInvalid");
  }

  const spectacle = await prisma.event.findUnique({
    where: { id: eventId },
    select: { acceptCard: true, acceptIban: true, acceptPaypal: true },
  });
  if (!spectacle) return failure("notFound");
  const carte = acceptCard ?? spectacle.acceptCard;
  const virement = acceptIban ?? spectacle.acceptIban;
  if (!carte && !virement && !spectacle.acceptPaypal) {
    return failure("paymentRequired");
  }

  const fields = {
    startsAt,
    endsAt: endsAt ?? null,
    doorsAt: doorsAt ?? null,
    status,
    label: Object.keys(label).length > 0 ? label : Prisma.DbNull,
    venueId,
    seatPlanId,
    capacity,
    acceptCard,
    acceptIban,
  };

  try {
    const row = await prisma.$transaction(async (tx) => {
      const saved = id
        ? await tx.eventSession.update({ where: { id }, data: fields })
        : await tx.eventSession.create({ data: { ...fields, eventId } });
      if (planChanged && id) {
        // Rien n'est vendu : les sièges et les zones de l'ancien plan
        // (blocages invités compris) n'ont plus de sens.
        await tx.sessionSeat.deleteMany({ where: { sessionId: id } });
        await tx.ticketType.updateMany({
          where: { sessionId: id },
          data: { seatZones: [] },
        });
      }
      if (seatPlanId) await syncSessionSeats(saved.id, tx);
      return saved;
    });
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
    select: { eventId: true, seatPlan: { select: { layout: true } } },
  });
  if (!seance || !(await guardEvent(seance.eventId, scoped))) {
    return failure("forbiddenOrganizer");
  }

  // Toutes les zones cochées revient à n'en restreindre aucune : on stocke
  // alors une liste vide, qui reste valable si le plan gagne une zone.
  const layout = readLayout(seance.seatPlan?.layout);
  let seatZones: string[] = [];
  if (layout) {
    const known = new Set(layout.zones.map((z) => z.key));
    const picked = new Set(
      data.getAll("seatZones").filter((v): v is string => typeof v === "string" && known.has(v)),
    );
    if (picked.size === 0) return failure("seatZonesRequired");
    if (picked.size < known.size) seatZones = [...picked];
  }

  const requiresAttendee = readBoolean(data, "requiresAttendee");
  const maxAgeRaw = readText(data, "maxAgeYears");
  let maxAgeYears: number | null = null;
  if (maxAgeRaw !== "") {
    const n = readInteger(data, "maxAgeYears");
    if (n === null || n < 1 || n > 120) return failure("ageInvalid");
    maxAgeYears = n;
  }
  // L'âge se contrôle sur la date de naissance saisie pour chaque billet.
  if (maxAgeYears !== null && !requiresAttendee) {
    return failure("ageNeedsAttendee");
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
    seatZones,
    requiresAttendee,
    maxAgeYears,
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

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
