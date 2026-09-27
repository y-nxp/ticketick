"use server";

import { publicSeatState } from "./seats";

/** Plan et sièges déjà pris d'une séance publiée, pour le choix des places. */
export async function getSeatState(sessionId: string) {
  if (typeof sessionId !== "string" || sessionId.length === 0 || sessionId.length > 64) {
    return null;
  }
  return publicSeatState(sessionId);
}
