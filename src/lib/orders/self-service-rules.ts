/**
 * Libre-service du client sur ses billets : échange (places, tarif, autre
 * spectacle du même organisateur) et annulation des places gratuites.
 * Partagé entre les pages (affichage) et le serveur (contrôle), pour qu'ils
 * ne divergent jamais.
 */

const HOUR_MS = 3600 * 1000;

export interface SelfServiceEvent {
  selfChange: boolean;
  changeUntilHours: number;
  selfCancelFree: boolean;
  cancelUntilHours: number;
}

/**
 * Billet échangeable. Le lien envoyé par l'organisateur vaut jusqu'au début
 * de la séance ; depuis le compte, il faut le réglage du spectacle et son délai.
 */
export function changeOpen(input: {
  startsAt: Date;
  event: SelfServiceEvent;
  viaAccount: boolean;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  if (input.startsAt <= now) return false;
  if (!input.viaAccount) return true;
  return (
    input.event.selfChange &&
    input.startsAt.getTime() - input.event.changeUntilHours * HOUR_MS > now.getTime()
  );
}

/** Place gratuite que le client peut rendre depuis son compte. */
export function cancelOpen(input: {
  startsAt: Date;
  paidCents: number;
  event: SelfServiceEvent;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  return (
    input.paidCents === 0 &&
    input.event.selfCancelFree &&
    input.startsAt.getTime() - input.event.cancelUntilHours * HOUR_MS > now.getTime()
  );
}

export interface BasketTariff {
  id: string;
  priceCents: number;
  available: number;
  maxPerOrder: number;
  /** Au plus N de ces places par billet payant de la séance (ou du tarif source). */
  maxPerPaidTicket: number | null;
  companionOfId: string | null;
  /** Nom et date de naissance exigés : repris des billets rendus. */
  requiresAttendee: boolean;
}

export type BasketError =
  | "empty"
  | "soldOut"
  | "maxPerOrder"
  | "companionRequiresPaid"
  | "companionLimit"
  | "attendeesMissing";

/**
 * Nouveaux billets d'un échange. Les places nominatives (âge, accompagnant)
 * reprennent le titulaire d'un billet rendu : on n'en ajoute pas d'office.
 */
export function checkBasket(input: {
  lines: { ticketTypeId: string; quantity: number }[];
  tariffs: BasketTariff[];
  /** Billets rendus qui portent un titulaire (nom et date de naissance). */
  holders: number;
}): { ok: true } | { ok: false; error: BasketError; ticketTypeId?: string } {
  const lines = input.lines.filter((l) => l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: "empty" };
  const byId = new Map(input.tariffs.map((t) => [t.id, t]));
  const qty = new Map(lines.map((l) => [l.ticketTypeId, l.quantity]));

  let paid = 0;
  let named = 0;
  for (const line of lines) {
    const tariff = byId.get(line.ticketTypeId);
    if (!tariff) return { ok: false, error: "soldOut", ticketTypeId: line.ticketTypeId };
    if (line.quantity > tariff.available) {
      return { ok: false, error: "soldOut", ticketTypeId: tariff.id };
    }
    if (line.quantity > tariff.maxPerOrder) {
      return { ok: false, error: "maxPerOrder", ticketTypeId: tariff.id };
    }
    if (tariff.maxPerPaidTicket == null && tariff.priceCents > 0) paid += line.quantity;
    if (tariff.requiresAttendee) named += line.quantity;
  }
  for (const line of lines) {
    const tariff = byId.get(line.ticketTypeId)!;
    if (tariff.maxPerPaidTicket == null) continue;
    const base = tariff.companionOfId == null ? paid : (qty.get(tariff.companionOfId) ?? 0);
    if (base === 0) return { ok: false, error: "companionRequiresPaid", ticketTypeId: tariff.id };
    if (line.quantity > base * tariff.maxPerPaidTicket) {
      return { ok: false, error: "companionLimit", ticketTypeId: tariff.id };
    }
  }
  if (named > input.holders) return { ok: false, error: "attendeesMissing" };
  return { ok: true };
}

/**
 * Places encore possibles à ce tarif, les autres quantités restant telles
 * quelles : mêmes règles que `checkBasket`, pour griser à l'écran ce qu'il
 * refuserait (gratuité sans place payante, nominatif sans titulaire).
 */
export function tariffRoom(input: {
  ticketTypeId: string;
  counts: Record<string, number>;
  tariffs: BasketTariff[];
  holders: number;
}): number {
  const tariff = input.tariffs.find((t) => t.id === input.ticketTypeId);
  if (!tariff) return 0;
  const count = (id: string) => input.counts[id] ?? 0;
  let room = Math.min(tariff.available, tariff.maxPerOrder);
  if (tariff.maxPerPaidTicket != null) {
    const base =
      tariff.companionOfId == null
        ? input.tariffs
            .filter((t) => t.maxPerPaidTicket == null && t.priceCents > 0)
            .reduce((sum, t) => sum + count(t.id), 0)
        : count(tariff.companionOfId);
    room = Math.min(room, base * tariff.maxPerPaidTicket);
  }
  if (tariff.requiresAttendee) {
    const otherNamed = input.tariffs
      .filter((t) => t.requiresAttendee && t.id !== tariff.id)
      .reduce((sum, t) => sum + count(t.id), 0);
    room = Math.min(room, input.holders - otherNamed);
  }
  return Math.max(0, room);
}

/** Ce que le client paie : la hausse nette, jamais de remboursement. */
export function exchangeDue(input: {
  givenCents: number[];
  lines: { priceCents: number; quantity: number }[];
}): { newCents: number; givenCents: number; dueCents: number } {
  const newCents = input.lines.reduce((sum, l) => sum + l.priceCents * l.quantity, 0);
  const givenCents = input.givenCents.reduce((sum, c) => sum + c, 0);
  return { newCents, givenCents, dueCents: Math.max(0, newCents - givenCents) };
}
