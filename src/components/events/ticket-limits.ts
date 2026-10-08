import type { SessionItem, TicketType } from "@/lib/types";

export type Counts = Record<string, number>;

/** Billets qui débloquent un tarif gratuit : la zone désignée, sinon tous. */
export function paidFor(
  session: SessionItem,
  tt: TicketType,
  current: Counts,
): number {
  if (tt.companionOfId) return current[tt.companionOfId] ?? 0;
  return session.ticketTypes.reduce((sum, x) => {
    if (x.maxPerPaidTicket != null || x.priceCents <= 0) return sum;
    return sum + (current[x.id] ?? 0);
  }, 0);
}

/** Réservation gratuite : son plafond vaut par personne pour la séance. */
export function isFreeBooking(tt: TicketType): boolean {
  return tt.priceCents <= 0 && tt.maxPerPaidTicket == null;
}

/**
 * Plafond de la sélection en cours, le panier comptant déjà pour la même
 * commande : sinon deux ajouts successifs doublaient le maximum.
 */
export function maxWithCart(
  session: SessionItem,
  tt: TicketType,
  current: Counts,
  cart: Counts,
): number {
  const merged: Counts = { ...cart };
  for (const [id, n] of Object.entries(current)) merged[id] = (merged[id] ?? 0) + n;
  return Math.max(0, maxFor(session, tt, merged) - (cart[tt.id] ?? 0));
}

/** Quantité maximale d'un tarif compte tenu du reste de la sélection. */
export function maxFor(
  session: SessionItem,
  tt: TicketType,
  current: Counts,
): number {
  const resteTarif = Math.max(0, tt.quantity - tt.sold);
  const autres = session.ticketTypes.reduce(
    (sum, x) => (x.id === tt.id ? sum : sum + (current[x.id] ?? 0)),
    0,
  );
  const resteJauge =
    session.capacity == null
      ? Number.POSITIVE_INFINITY
      : Math.max(0, session.capacity - session.sold - autres);
  let max = Math.min(tt.maxPerOrder, resteTarif, resteJauge);
  if (tt.maxPerPaidTicket != null) {
    max = Math.min(max, paidFor(session, tt, current) * tt.maxPerPaidTicket);
  }
  return max;
}
