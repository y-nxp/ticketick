"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/dal";
import { catalogActor } from "@/lib/admin/access";
import { prisma } from "@/lib/prisma";
import {
  parseHexColor,
  parseNavLinksText,
  parseOrganizerScheme,
} from "@/lib/branding/theme";
import { saveUploadedImage, UploadError } from "@/lib/uploads";
import {
  failure,
  readOptionalText,
  readText,
  readTranslated,
  slugify,
  success,
  type FormState,
} from "./form";

/**
 * Données de référence du catalogue : organisateurs, lieux, catégories.
 *
 * Un spectacle ne peut pas exister sans organisateur ; sur une base neuve, ces
 * écrans sont donc le point de départ obligé.
 *
 * Chaque action appelle `requireAdmin` pour son propre compte. Une action
 * serveur est une adresse joignable directement : la protéger en amont, dans
 * la page qui l'expose, ne protégerait que le formulaire, pas l'action.
 */

/** Violation d'unicité Postgres, remontée par Prisma. */
function isDuplicate(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * Suppression refusée parce que des lignes en dépendent.
 *
 * Préférable à une cascade : effacer un lieu emporterait sinon les séances
 * jouées là, et avec elles des billets déjà vendus.
 */
function isReferenced(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003"
  );
}

function refreshCatalog() {
  revalidatePath("/admin/settings");
  revalidatePath("/admin/events");
  revalidatePath("/");
  revalidatePath("/go", "layout");
  revalidatePath("/embed", "layout");
}

// ─────────────────────────────── Organisateurs

export async function saveOrganizer(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const { user, organizerId: scoped } = await catalogActor();

  const id = readOptionalText(data, "id");
  if (scoped && id !== scoped) return failure("forbiddenOrganizer");
  if (scoped && !id) return failure("forbiddenOrganizer");

  const name = readText(data, "name");
  const email = readText(data, "email");

  if (name.length < 2) return failure("nameRequired");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return failure("emailInvalid");

  const notifyEmails = (data.get("notifyEmails")?.toString() ?? "")
    .split(/[\n,;]+/)
    .map((adresse) => adresse.trim().toLowerCase())
    .filter((adresse) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adresse));

  const disclaimer = readTranslated(data, "ticketDisclaimer");

  const fields = {
    name,
    email,
    description: readOptionalText(data, "description") ?? null,
    website: readOptionalText(data, "website") ?? null,
    logoUrl: readOptionalText(data, "logoUrl") ?? null,
    brandPrimary: parseHexColor(readOptionalText(data, "brandPrimary")) ?? null,
    brandAccent: parseHexColor(readOptionalText(data, "brandAccent")) ?? null,
    brandBg: parseHexColor(readOptionalText(data, "brandBg")) ?? null,
    brandScheme: parseOrganizerScheme(data.get("brandScheme")?.toString()),
    navLinks: parseNavLinksText(
      data.get("navLinks")?.toString() ?? "",
    ) as unknown as Prisma.InputJsonValue,
    notifyEmails,
    producerName: readOptionalText(data, "producerName") ?? null,
    producerUrl: readOptionalText(data, "producerUrl") ?? null,
    producerLogoUrl: readOptionalText(data, "producerLogoUrl") ?? null,
    ticketDisclaimer: (disclaimer.fr
      ? disclaimer
      : Prisma.DbNull) as Prisma.InputJsonValue,
  };

  try {
    const row = id
      ? await prisma.organizer.update({ where: { id }, data: fields })
      : await prisma.organizer.create({
          data: { ...fields, slug: slugify(name) },
        });

    try {
      const logo = await saveUploadedImage(data.get("logoFile"), `organizers/${row.id}`);
      const producerLogo = await saveUploadedImage(
        data.get("producerLogoFile"),
        `organizers/${row.id}/producer`,
      );
      if (logo || producerLogo) {
        await prisma.organizer.update({
          where: { id: row.id },
          data: {
            ...(logo ? { logoUrl: logo } : {}),
            ...(producerLogo ? { producerLogoUrl: producerLogo } : {}),
          },
        });
      }
    } catch (error) {
      if (error instanceof UploadError) return failure(error.key);
      throw error;
    }

    if (user.role === "ADMIN") {
      const loginEmail = readOptionalText(data, "loginEmail")?.toLowerCase();
      if (loginEmail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(loginEmail)) {
        const account = await prisma.user.findUnique({
          where: { email: loginEmail },
          select: { id: true },
        });
        if (account) {
          await prisma.organizer.update({
            where: { id: row.id },
            data: { userId: account.id },
          });
          await prisma.user.update({
            where: { id: account.id },
            data: { role: "ORGANIZER" },
          });
        }
      }
    }

    refreshCatalog();
    return success(row.id);
  } catch (error) {
    if (isDuplicate(error)) return failure("slugTaken");
    console.error("[admin] enregistrement organisateur", error);
    return failure("unavailable");
  }
}

export async function deleteOrganizer(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  await requireAdmin();
  const id = readText(data, "id");
  if (!id) return failure("notFound");

  // Contrôlé explicitement plutôt que laissé à la contrainte : le message
  // « cet organisateur porte des spectacles » est exploitable, « erreur de
  // clé étrangère » ne l'est pas.
  const events = await prisma.event.count({ where: { organizerId: id } });
  if (events > 0) return failure("organizerHasEvents");

  try {
    await prisma.organizer.delete({ where: { id } });
    refreshCatalog();
    return success();
  } catch (error) {
    if (isReferenced(error)) return failure("organizerHasEvents");
    console.error("[admin] suppression organisateur", error);
    return failure("unavailable");
  }
}

// ─────────────────────────────── Lieux

export async function saveVenue(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  await requireAdmin();

  const id = readOptionalText(data, "id");
  const name = readText(data, "name");
  const city = readText(data, "city");

  if (name.length < 2) return failure("nameRequired");
  if (city.length < 2) return failure("cityRequired");

  const lat = readOptionalText(data, "lat");
  const lng = readOptionalText(data, "lng");

  // La carte n'est affichée que si les deux coordonnées sont présentes : une
  // latitude seule produirait un point sur le méridien de Greenwich.
  const coords =
    lat && lng && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng))
      ? { lat: Number(lat), lng: Number(lng) }
      : { lat: null, lng: null };

  const fields = {
    name,
    city,
    address: readOptionalText(data, "address") ?? null,
    zip: readOptionalText(data, "zip") ?? null,
    canton: readOptionalText(data, "canton") ?? null,
    ...coords,
  };

  try {
    const row = id
      ? await prisma.venue.update({ where: { id }, data: fields })
      : await prisma.venue.create({ data: fields });
    refreshCatalog();
    return success(row.id);
  } catch (error) {
    console.error("[admin] enregistrement lieu", error);
    return failure("unavailable");
  }
}

export async function deleteVenue(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  await requireAdmin();
  const id = readText(data, "id");
  if (!id) return failure("notFound");

  const sessions = await prisma.eventSession.count({ where: { venueId: id } });
  if (sessions > 0) return failure("venueHasSessions");

  try {
    await prisma.venue.delete({ where: { id } });
    refreshCatalog();
    return success();
  } catch (error) {
    if (isReferenced(error)) return failure("venueHasSessions");
    console.error("[admin] suppression lieu", error);
    return failure("unavailable");
  }
}

// ─────────────────────────────── Catégories

export async function saveCategory(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  await requireAdmin();

  const id = readOptionalText(data, "id");
  const name = readTranslated(data, "name");
  if (!name.fr) return failure("nameRequired");

  const color = readText(data, "color");
  const fields = {
    name,
    color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#6C5CE7",
  };

  try {
    const row = id
      ? await prisma.category.update({ where: { id }, data: fields })
      : await prisma.category.create({
          data: { ...fields, slug: slugify(name.fr) },
        });
    refreshCatalog();
    return success(row.id);
  } catch (error) {
    if (isDuplicate(error)) return failure("slugTaken");
    console.error("[admin] enregistrement catégorie", error);
    return failure("unavailable");
  }
}

export async function deleteCategory(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  await requireAdmin();
  const id = readText(data, "id");
  if (!id) return failure("notFound");

  try {
    // La relation avec les spectacles est un simple rattachement : le retirer
    // ne supprime aucun spectacle.
    await prisma.category.delete({ where: { id } });
    refreshCatalog();
    return success();
  } catch (error) {
    console.error("[admin] suppression catégorie", error);
    return failure("unavailable");
  }
}
