/** Durée pendant laquelle une commande carte retient les places. */
export const CARD_HOLD_MINUTES = 10;
export const CARD_HOLD_MS = CARD_HOLD_MINUTES * 60 * 1000;

export function reservedUntilFrom(createdAt: Date): Date {
  return new Date(createdAt.getTime() + CARD_HOLD_MS);
}

export function formatHoldClock(msLeft: number): string {
  const total = Math.max(0, Math.ceil(msLeft / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
