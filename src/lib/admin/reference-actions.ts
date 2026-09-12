"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
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
}

// ─────────────────────────────── Organisateurs

export async function saveOrganizer(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  await requireAdmin();

  const id = readOptionalText(data, "id");
  const name = readText(data, "name");
  const email = readText(data, "email");

  if (name.length < 2) return failure("nameRequired");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return failure("emailInvalid");

  const fields = {
    name,
    email,
    description: readOptionalText(data, "description") ?? null,
    website: readOptionalText(data, "website") ?? null,
  };

  try {
    const row = id
      ? await prisma.organizer.update({ where: { id }, data: fields })
      : await prisma.organizer.create({
          data: { ...fields, slug: slugify(name) },
        });
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
