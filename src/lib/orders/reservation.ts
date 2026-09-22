/** Durée pendant laquelle une commande carte retient les places. */
export const CARD_HOLD_MINUTES = 25;
export const CARD_HOLD_MS = CARD_HOLD_MINUTES * 60 * 1000;

export function reservedUntilFrom(createdAt: Date): Date {
  return new Date(createdAt.getTime() + CARD_HOLD_MS);
}

/**
 * Rétention carte dont le chrono est écoulé : le visiteur n'a jamais payé.
 * Le statut en base reste `AWAITING_PAYMENT` jusqu'au prochain balayage, d'où
 * un libellé distinct côté back-office.
 */
export function isAbandonedCardHold(
  order: { status: string; paymentMethod: string | null; createdAt: Date },
  now: Date = new Date(),
): boolean {
  if (order.status !== "AWAITING_PAYMENT" || order.paymentMethod !== "CARD") {
    return false;
  }
  return reservedUntilFrom(order.createdAt) <= now;
}

export function formatHoldClock(msLeft: number): string {
  const total = Math.max(0, Math.ceil(msLeft / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
