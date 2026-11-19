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

/**
 * Caisse à l'entrée (app de contrôle › Caisse) : activée pour les
 * organisateurs qui encaissent avec Collect for Stripe sur un WisePad.
 */
export async function saveDoorTill(_prev: CatalogSyncState, formData: FormData): Promise<CatalogSyncState> {
  const { organizerId: own } = await catalogActor();
  const organizerId = String(formData.get("organizerId") ?? "");
  if (!organizerId || !(await assertOrganizerAccess(organizerId, own))) {
    return { ok: false, error: "forbidden" };
  }
  await prisma.organizer.update({
    where: { id: organizerId },
    data: { doorTill: formData.get("doorTill") === "on" ? "collect" : null },
  });
  revalidatePath("/[locale]/admin/stripe-catalog", "page");
  return { ok: true, created: 0, updated: 0, archived: 0, unchanged: 0, failed: 0 };
}
