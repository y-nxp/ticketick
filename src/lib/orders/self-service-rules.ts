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
  /** Nom et date de naissance du bénéficiaire exigés, comme au paiement sur le site. */
  requiresAttendee: boolean;
}

export type BasketError =
  | "empty"
  | "soldOut"
  | "maxPerOrder"
  | "companionRequiresPaid"
  | "companionLimit";

export type CompanionTariff = Pick<
  BasketTariff,
  "id" | "priceCents" | "maxPerPaidTicket" | "companionOfId"
>;

/**
 * Gratuités liées aux places payantes d'une même séance : au plus N par place
 * payante (ou par place du tarif source). Sert aux nouveaux billets d'un
 * échange comme à ceux qui restent dans la commande après l'échange.
 */
export function companionError(input: {
  lines: { ticketTypeId: string; quantity: number }[];
  tariffs: CompanionTariff[];
}): { error: "companionRequiresPaid" | "companionLimit"; ticketTypeId: string } | null {
  const byId = new Map(input.tariffs.map((t) => [t.id, t]));
  const qty = new Map<string, number>();
  for (const l of input.lines) qty.set(l.ticketTypeId, (qty.get(l.ticketTypeId) ?? 0) + l.quantity);
  let paid = 0;
  for (const [id, n] of qty) {
    const tariff = byId.get(id);
    if (tariff && tariff.maxPerPaidTicket == null && tariff.priceCents > 0) paid += n;
  }
  for (const [id, n] of qty) {
    const tariff = byId.get(id);
    if (!tariff || tariff.maxPerPaidTicket == null || n === 0) continue;
    const base = tariff.companionOfId == null ? paid : (qty.get(tariff.companionOfId) ?? 0);
    if (base === 0) return { error: "companionRequiresPaid", ticketTypeId: id };
    if (n > base * tariff.maxPerPaidTicket) return { error: "companionLimit", ticketTypeId: id };
  }
  return null;
}

/** Nouveaux billets d'un échange : stock, plafond par commande, gratuités liées aux places payantes. */
export function checkBasket(input: {
  lines: { ticketTypeId: string; quantity: number }[];
  tariffs: BasketTariff[];
}): { ok: true } | { ok: false; error: BasketError; ticketTypeId?: string } {
  const lines = input.lines.filter((l) => l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: "empty" };
  const byId = new Map(input.tariffs.map((t) => [t.id, t]));

  for (const line of lines) {
    const tariff = byId.get(line.ticketTypeId);
    if (!tariff) return { ok: false, error: "soldOut", ticketTypeId: line.ticketTypeId };
    if (line.quantity > tariff.available) {
      return { ok: false, error: "soldOut", ticketTypeId: tariff.id };
    }
    if (line.quantity > tariff.maxPerOrder) {
      return { ok: false, error: "maxPerOrder", ticketTypeId: tariff.id };
    }
  }
  const companion = companionError({ lines, tariffs: input.tariffs });
  return companion ? { ok: false, ...companion } : { ok: true };
}

/**
 * Places encore possibles à ce tarif, les autres quantités restant telles
 * quelles : mêmes règles que `checkBasket`, pour griser à l'écran ce qu'il
 * refuserait (gratuité sans place payante).
 */
export function tariffRoom(input: {
  ticketTypeId: string;
  counts: Record<string, number>;
  tariffs: BasketTariff[];
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
  return Math.max(0, room);
}

export type ExchangeRuleError = "nothingGiven" | "seatCount" | "freeSeats" | "lowerValue";

/**
 * Un échange, pas un achat : chaque billet rendu donne exactement un nouveau
 * billet, sur le même spectacle ou un autre. Une différence en faveur du
 * client ne paie jamais une place de plus, et une place gratuite ne se
 * reprend qu'en rendant une place gratuite. Par le lien, sans compte, le
 * nouveau choix vaut en outre au moins autant : quiconque obtient le lien ne
 * peut pas faire perdre de valeur au client. Depuis le compte, une place
 * moins chère reste possible, sans remboursement.
 */
export function exchangeRuleError(input: {
  viaAccount: boolean;
  /** Programme modifié : une place moins chère est permise, la différence est remboursée. */
  allowLower?: boolean;
  givenCount: number;
  newCount: number;
  givenFree: number;
  newFree: number;
  givenCents: number;
  newCents: number;
}): ExchangeRuleError | null {
  if (input.givenCount === 0) return "nothingGiven";
  if (input.newCount !== input.givenCount) return "seatCount";
  if (input.newFree > input.givenFree) return "freeSeats";
  if (!input.viaAccount && !input.allowLower && input.newCents < input.givenCents) {
    return "lowerValue";
  }
  return null;
}

/** Bénéficiaire comparable : nom sans casse ni espaces superflus, date AAAA-MM-JJ. */
export function holderKey(name: string, birthDate: string): string {
  return `${name.trim().replace(/\s+/g, " ").toLowerCase()}|${birthDate}`;
}

/**
 * Un échange ne transfère pas un billet nominatif à quelqu'un d'autre : les
 * bénéficiaires des billets rendus se retrouvent sur les nouveaux billets
 * nominatifs, tant qu'il y en a. Au-delà (billet rendu non nominatif), le
 * nom est libre.
 */
export function holdersKept(given: string[], named: string[]): boolean {
  const left = [...named];
  let kept = 0;
  for (const key of given) {
    const i = left.indexOf(key);
    if (i >= 0) {
      left.splice(i, 1);
      kept++;
    }
  }
  return kept >= Math.min(given.length, named.length);
}

/**
 * Ce que le client paie : la hausse nette. La baisse (`refundCents`) ne lui
 * est rendue que si le programme a changé ; sinon elle est perdue.
 */
export function exchangeDue(input: {
  givenCents: number[];
  lines: { priceCents: number; quantity: number }[];
}): { newCents: number; givenCents: number; dueCents: number; refundCents: number } {
  const newCents = input.lines.reduce((sum, l) => sum + l.priceCents * l.quantity, 0);
  const givenCents = input.givenCents.reduce((sum, c) => sum + c, 0);
  return {
    newCents,
    givenCents,
    dueCents: Math.max(0, newCents - givenCents),
    refundCents: Math.max(0, givenCents - newCents),
  };
}

export interface PricedOrder {
  subtotalCents: number;
  discountCents: number;
  feeCents: number;
  items: { ticketTypeId: string; quantity: number; unitPriceCents: number; discountCents: number }[];
}

/**
 * Ce que le client a réellement payé pour un billet de chaque tarif : prix
 * moins sa part des rabais, plus sa part des frais. Les commandes anciennes
 * n'ont pas la part du rabais par ligne : il est alors réparti au prorata du
 * montant de chaque ligne. Arrondi au centime inférieur, pour ne jamais rendre
 * plus que payé.
 */
export function netTicketPrices(order: PricedOrder): Map<string, number> {
  const lines = new Map<string, { gross: number; discount: number; quantity: number }>();
  for (const item of order.items) {
    const line = lines.get(item.ticketTypeId) ?? { gross: 0, discount: 0, quantity: 0 };
    line.gross += item.unitPriceCents * item.quantity;
    line.discount += item.discountCents;
    line.quantity += item.quantity;
    lines.set(item.ticketTypeId, line);
  }
  const perLine = order.items.some((i) => i.discountCents > 0);
  const base = order.subtotalCents - order.discountCents;
  const feeRatio = base > 0 ? (base + order.feeCents) / base : 1;

  const out = new Map<string, number>();
  for (const [ticketTypeId, line] of lines) {
    if (line.quantity <= 0) continue;
    const discount = perLine
      ? line.discount
      : order.subtotalCents > 0
        ? (order.discountCents * line.gross) / order.subtotalCents
        : 0;
    const net = Math.max(0, line.gross - discount) * feeRatio;
    out.set(ticketTypeId, Math.floor(net / line.quantity));
  }
  return out;
}

/** Fin de journée à Zurich (23:59:59, heure d'hiver ou d'été) d'une date AAAA-MM-JJ. */
export function endOfDayZurich(day: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const guess = new Date(`${day}T23:59:59Z`);
  if (Number.isNaN(guess.getTime())) return null;
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", hour: "2-digit", hourCycle: "h23" }).format(
      guess,
    ),
  );
  const offsetHours = (hour - 23 + 24) % 24;
  return new Date(guess.getTime() - offsetHours * 3600 * 1000);
}
