"use server";

import { revalidatePath } from "next/cache";
import type { DiscountType } from "@prisma/client";
import { catalogActor } from "@/lib/admin/access";
import { prisma } from "@/lib/prisma";
import {
  failure,
  readBoolean,
  readInteger,
  readMoneyCents,
  readOptionalDateTime,
  readOptionalText,
  readText,
  readTranslated,
  success,
  type FormState,
} from "./form";

/**
 * Rabais automatiques : appliqués sans code dès que la commande compte assez
 * de séances payantes distinctes de l'organisateur (et du lieu, si précisé).
 *
 * Un rabais déjà accordé sur une commande ne se supprime pas : la commande
 * garde la trace du montant déduit. On le désactive.
 */

const TYPES = ["PERCENTAGE", "FIXED_AMOUNT"] as const satisfies readonly DiscountType[];

function refresh() {
  revalidatePath("/admin/discounts");
}

/** « 15 » ou « 12.5 » → points de base (1500, 1250). */
function readPercentBps(data: FormData, name: string): number | null {
  const raw = readText(data, name).replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  return Math.round(Number(raw) * 100);
}

async function ownedDiscount(id: string, scoped: string | null) {
  const row = await prisma.discount.findUnique({
    where: { id },
    select: { organizerId: true, code: true, _count: { select: { orders: true } } },
  });
  if (!row || row.code !== null) return null;
  if (scoped && row.organizerId !== scoped) return null;
  return row;
}

export async function saveDiscount(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const { organizerId: scoped } = await catalogActor();

  const id = readOptionalText(data, "id");
  if (id && !(await ownedDiscount(id, scoped))) return failure("notFound");

  const label = readTranslated(data, "label");
  if (!label.fr) return failure("nameRequired");

  const organizerId = scoped ?? readText(data, "organizerId");
  if (!organizerId) return failure("organizerRequired");
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    select: { id: true },
  });
  if (!organizer) return failure("organizerRequired");

  const venueId = readOptionalText(data, "venueId") ?? null;
  if (venueId) {
    const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { id: true } });
    if (!venue) return failure("notFound");
  }

  const typeRaw = readText(data, "type");
  if (!(TYPES as readonly string[]).includes(typeRaw)) return failure("discountValueInvalid");
  const type = typeRaw as DiscountType;
  const value =
    type === "PERCENTAGE" ? readPercentBps(data, "value") : readMoneyCents(data, "value");
  if (value === null || value <= 0 || (type === "PERCENTAGE" && value > 10_000)) {
    return failure("discountValueInvalid");
  }

  const minDistinctSessions = readInteger(data, "minDistinctSessions");
  if (minDistinctSessions === null || minDistinctSessions < 1 || minDistinctSessions > 100) {
    return failure("discountMinSessionsInvalid");
  }

  let minAmountCents: number | null = null;
  if (readText(data, "minAmount") !== "") {
    minAmountCents = readMoneyCents(data, "minAmount");
    if (minAmountCents === null) return failure("priceInvalid");
  }

  const validFrom = readOptionalDateTime(data, "validFrom");
  const validUntil = readOptionalDateTime(data, "validUntil");
  if (validFrom === null || validUntil === null) return failure("validityInvalid");
  if (validFrom && validUntil && validUntil <= validFrom) return failure("validityInvalid");

  const fields = {
    label,
    type,
    value,
    scope: "ORDER" as const,
    organizerId,
    venueId,
    minDistinctSessions,
    minAmountCents,
    validFrom: validFrom ?? null,
    validUntil: validUntil ?? null,
    active: readBoolean(data, "active"),
  };

  try {
    const row = id
      ? await prisma.discount.update({ where: { id }, data: fields })
      : await prisma.discount.create({ data: fields });
    refresh();
    return success(row.id);
  } catch (error) {
    console.error("[admin] enregistrement rabais", error);
    return failure("unavailable");
  }
}

export async function deleteDiscount(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const { organizerId: scoped } = await catalogActor();
  const id = readText(data, "id");
  const row = id ? await ownedDiscount(id, scoped) : null;
  if (!row) return failure("notFound");
  if (row._count.orders > 0) return failure("discountHasOrders");

  try {
    await prisma.discount.delete({ where: { id } });
    refresh();
    return success();
  } catch (error) {
    console.error("[admin] suppression rabais", error);
    return failure("unavailable");
  }
}
