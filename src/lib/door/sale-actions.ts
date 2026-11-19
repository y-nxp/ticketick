"use server";

import { getLocale } from "next-intl/server";
import { requireRole } from "@/lib/auth/dal";
import { prepareDoorSale } from "./sale";
import { DOOR_ROLES } from "./scope";

export type DoorSaleState =
  | { ok: true; kind: "collect"; url: string; webUrl: string }
  | { ok: true; kind: "done"; saleId: string }
  | { ok: false; error: string; ticketTypeId?: string }
  | null;

/**
 * Carte : prépare la vente et renvoie le lien qui ouvre Collect. TWINT,
 * espèces ou gratuit : compte la vente tout de suite.
 */
export async function startDoorSale(_prev: DoorSaleState, formData: FormData): Promise<DoorSaleState> {
  const user = await requireRole(DOOR_ROLES, "/door/sell");
  const locale = await getLocale();
  const sessionId = String(formData.get("sessionId") ?? "");
  const lines: { ticketTypeId: string; quantity: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("qty:")) continue;
    const quantity = Number(value);
    if (quantity > 0) lines.push({ ticketTypeId: key.slice(4), quantity });
  }
  const method = String(formData.get("method") ?? "card");
  return prepareDoorSale(user, {
    sessionId,
    lines,
    locale,
    method: method === "twint" || method === "cash" ? method : "card",
    key: String(formData.get("key") ?? ""),
  });
}
