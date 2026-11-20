"use server";

import { revalidatePath } from "next/cache";
import { assertEventOwned, assertOrganizerAccess, catalogActor } from "@/lib/admin/access";
import { syncStripeCatalog, type CatalogSyncResult } from "@/lib/payment/stripe-catalog";
import { prisma } from "@/lib/prisma";

export type CatalogSyncState =
  | ({ ok: true } & CatalogSyncResult)
  | { ok: false; error: string }
  | null;

/**
 * Bouton « Synchroniser » : tout l'organisateur, ou un seul spectacle quand
 * `eventId` est fourni.
 */
export async function syncStripeCatalogAction(
  _prev: CatalogSyncState,
  formData: FormData,
): Promise<CatalogSyncState> {
  const { organizerId: own } = await catalogActor();
  const organizerId = String(formData.get("organizerId") ?? "");
  const eventId = String(formData.get("eventId") ?? "") || undefined;
  if (!organizerId || !(await assertOrganizerAccess(organizerId, own))) {
    return { ok: false, error: "forbidden" };
  }
  if (eventId && !(await assertEventOwned(eventId, organizerId))) {
    return { ok: false, error: "forbidden" };
  }

  const outcome = await syncStripeCatalog(organizerId, { eventId });
  revalidatePath("/[locale]/admin/stripe-catalog", "page");
  return outcome.ok ? { ok: true, ...outcome.result } : { ok: false, error: outcome.error };
}

export type TwintNumberState = { ok: true } | { ok: false; error: string } | null;

/** Numéro TWINT affiché à la caisse sur place (paiement confirmé à la main). */
export async function saveTillTwintNumber(_prev: TwintNumberState, formData: FormData): Promise<TwintNumberState> {
  const { organizerId: own } = await catalogActor();
  const organizerId = String(formData.get("organizerId") ?? "");
  if (!organizerId || !(await assertOrganizerAccess(organizerId, own))) {
    return { ok: false, error: "forbidden" };
  }
  const number = String(formData.get("twintNumber") ?? "").trim();
  if (number.length > 40 || (number && !/^[+\d][\d\s./-]{5,}$/.test(number))) {
    return { ok: false, error: "twintNumber" };
  }
  await prisma.organizer.update({ where: { id: organizerId }, data: { tillTwintNumber: number || null } });
  revalidatePath("/[locale]/admin/stripe-catalog", "page");
  return { ok: true };
}
