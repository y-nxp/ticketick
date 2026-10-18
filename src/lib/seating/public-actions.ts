"use server";

import { releaseStaleUnpaidCardOrders } from "@/lib/orders/create-order";
import { publicSeatState, unavailableAmong } from "./seats";

const validId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 64;

/**
 * Plan et sièges déjà pris d'une séance publiée, pour le choix des places.
 * Rend d'abord les rétentions périmées : sans cela, une place abandonnée
 * resterait grise jusqu'au prochain balayage.
 */
export async function getSeatState(sessionId: string) {
  if (!validId(sessionId)) return null;
  await releaseStaleUnpaidCardOrders().catch((error) => {
    console.error("[plan] nettoyage des rétentions périmées", error);
  });
  return publicSeatState(sessionId);
}

/**
 * Sièges qui ne sont plus libres parmi ceux qu'on s'apprête à mettre au
 * panier. Le plan affiché est une photo : entre son chargement et le clic,
 * quelqu'un d'autre a pu prendre la place.
 */
export async function findTakenSeats(
  sessionId: string,
  keys: string[],
): Promise<string[]> {
  if (!validId(sessionId) || !Array.isArray(keys)) return [];
  const clean = keys
    .filter((k): k is string => typeof k === "string" && k.length > 0 && k.length <= 40)
    .slice(0, 100);
  if (clean.length === 0) return [];
  await releaseStaleUnpaidCardOrders().catch(() => {});
  return unavailableAmong(sessionId, clean);
}
