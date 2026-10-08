import { zoneAllowed } from "@/lib/seating/layout";

/**
 * Changement de places demandé par le client : tarif de chaque nouvelle place
 * et différence à payer. Partagé entre la page (affichage) et le serveur
 * (montant encaissé), pour qu'ils ne divergent jamais.
 */

export interface ChangeTariff {
  id: string;
  priceCents: number;
  seatZones: string[];
  /** Tarif d'accompagnement ou limité par l'âge : jamais attribué d'office. */
  restricted: boolean;
  available: boolean;
}

export interface ChangeTicket {
  id: string;
  ticketTypeId: string;
  /** Prix payé à l'achat pour ce tarif. */
  paidCents: number;
}

/** Le tarif du billet s'il vaut dans la zone visée, sinon le tarif principal de la zone. */
export function tariffForZone<T extends ChangeTariff>(
  ticket: ChangeTicket,
  zone: string,
  tariffs: T[],
): T | null {
  const own = tariffs.find((t) => t.id === ticket.ticketTypeId);
  if (own && zoneAllowed(own.seatZones, zone)) return own;
  const main = tariffs
    .filter((t) => !t.restricted && t.available && zoneAllowed(t.seatZones, zone))
    .sort((a, b) => b.priceCents - a.priceCents);
  return main[0] ?? null;
}

/** Prix de la nouvelle place : inchangé si le tarif reste le même. */
export function newPriceCents(ticket: ChangeTicket, tariff: ChangeTariff): number {
  return tariff.id === ticket.ticketTypeId ? ticket.paidCents : tariff.priceCents;
}

/** Ce que le client paie : la hausse nette, jamais de remboursement. */
export function amountDue(deltas: number[]): number {
  return Math.max(0, deltas.reduce((sum, d) => sum + d, 0));
}
