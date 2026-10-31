/**
 * Calcul des rabais automatiques, sans base de données.
 *
 * Deux familles, qui ne se cumulent pas :
 *
 * - **multi-séances** (`kind: "sessions"`) : N séances payantes distinctes
 *   chez l'organisateur, éventuellement dans un même lieu. Le multi-concerts
 *   du Gstaad New Year Music Festival (-15 % dès 3 concerts à Rougemont).
 * - **remise de groupe** (`kind: "group"`) : calculée spectacle par
 *   spectacle, d'après le nombre de places payantes de ce spectacle. Chaque
 *   palier est un rabais (8 places → 10 %, 11 places → 15 %).
 *
 * La commande reçoit la famille qui lui coûte le moins. La remise de groupe
 * ne se cumule pas non plus avec une gratuité accompagnante (-25 ans, deux
 * places offertes par place payante) : sur un spectacle qui en compte, on
 * garde la gratuité, ou bien on applique la remise de groupe en comptant
 * ces places au plein tarif, selon ce qui revient le moins cher.
 */

export interface EngineLine {
  quantity: number;
  unitPriceCents: number;
  sessionId: string;
  eventId: string;
  venueId: string | null;
  organizerId: string;
  /**
   * Gratuité accompagnante (tarif à 0 lié aux places payantes) : prix
   * normal de chacune de ses places. Absent pour les autres lignes.
   */
  companionRegularCents?: number[];
  /** Le spectacle est exclu de la remise de groupe. */
  groupDiscountOff?: boolean;
}

export interface EngineDiscount {
  id: string;
  label: unknown;
  kind: "sessions" | "group";
  type: "PERCENTAGE" | "FIXED_AMOUNT";
  /** Points de base (1000 = 10 %) ou centimes. */
  value: number;
  organizerId: string | null;
  venueId: string | null;
  minDistinctSessions: number | null;
  minQuantity: number | null;
  minAmountCents: number | null;
  maxRedemptions: number | null;
  redemptions: number;
}

export interface EngineApplied {
  discountId: string;
  label: unknown;
  amountCents: number;
  /** Remise de groupe obtenue en renonçant à des gratuités. */
  waivesCompanions: boolean;
}

export interface EngineResult {
  applied: EngineApplied[];
  /** Part du rabais portée par chaque ligne, dans l'ordre reçu. */
  perLine: number[];
  totalCents: number;
}

/** Arrondi aux 5 centimes, comme un montant en francs suisses. */
export function roundTo5(cents: number): number {
  return Math.round(cents / 5) * 5;
}

const isPaid = (l: EngineLine) => l.unitPriceCents > 0;
const isFreeCompanion = (l: EngineLine) =>
  l.unitPriceCents === 0 && (l.companionRegularCents?.length ?? 0) > 0;
const lineValue = (l: EngineLine) => l.quantity * l.unitPriceCents;

function usable(d: EngineDiscount): boolean {
  return d.maxRedemptions == null || d.redemptions < d.maxRedemptions;
}

/** Répartit `amount` sur les lignes au prorata de leur montant ; le reste d'arrondi va à la plus grosse. */
function spread(amount: number, indexes: number[], lines: EngineLine[], into: number[]) {
  const base = indexes.reduce((s, i) => s + lineValue(lines[i]), 0);
  if (amount <= 0 || base <= 0) return;
  let given = 0;
  let biggest = indexes[0];
  for (const i of indexes) {
    const share = Math.floor((amount * lineValue(lines[i])) / base);
    into[i] += share;
    given += share;
    if (lineValue(lines[i]) > lineValue(lines[biggest])) biggest = i;
  }
  into[biggest] += amount - given;
}

interface Candidate {
  applied: EngineApplied[];
  perLine: number[];
  totalCents: number;
}

function addApplied(list: EngineApplied[], d: EngineDiscount, amountCents: number, waives: boolean) {
  // Un même palier sur deux spectacles : une seule ligne, montants additionnés
  // (la commande ne garde qu'une trace par rabais).
  const existing = list.find((a) => a.discountId === d.id);
  if (existing) {
    existing.amountCents += amountCents;
    existing.waivesCompanions ||= waives;
  } else {
    list.push({ discountId: d.id, label: d.label, amountCents, waivesCompanions: waives });
  }
}

/** Multi-séances : le calcul historique, inchangé. */
function sessionsCandidate(lines: EngineLine[], discounts: EngineDiscount[]): Candidate {
  const perLine = lines.map(() => 0);
  const applied: EngineApplied[] = [];
  let remaining = lines.reduce((s, l) => s + lineValue(l), 0);

  for (const d of discounts) {
    if (d.kind !== "sessions" || !usable(d)) continue;
    const qualifying = lines
      .map((l, i) => ({ l, i }))
      .filter(
        ({ l }) =>
          isPaid(l) &&
          l.organizerId === d.organizerId &&
          (d.venueId == null || l.venueId === d.venueId),
      );
    const sessions = new Set(qualifying.map(({ l }) => l.sessionId));
    if (sessions.size < (d.minDistinctSessions ?? 0)) continue;

    const base = qualifying.reduce((s, { l }) => s + lineValue(l), 0);
    if (d.minAmountCents != null && base < d.minAmountCents) continue;
    const raw =
      d.type === "PERCENTAGE" ? roundTo5((base * d.value) / 10_000) : Math.min(d.value, base);
    const amountCents = Math.min(raw, remaining);
    if (amountCents <= 0) continue;
    remaining -= amountCents;
    addApplied(applied, d, amountCents, false);
    spread(amountCents, qualifying.map(({ i }) => i), lines, perLine);
  }
  return { applied, perLine, totalCents: applied.reduce((s, a) => s + a.amountCents, 0) };
}

/** Meilleur palier atteint par `count` places pour `base` centimes. */
function bestTier(tiers: EngineDiscount[], count: number, base: number): EngineDiscount | null {
  let best: EngineDiscount | null = null;
  for (const t of tiers) {
    if ((t.minQuantity ?? Infinity) > count) continue;
    if (t.minAmountCents != null && base < t.minAmountCents) continue;
    if (!best || t.value > best.value) best = t;
  }
  return best;
}

/** Remise de groupe, spectacle par spectacle. */
function groupCandidate(lines: EngineLine[], discounts: EngineDiscount[]): Candidate {
  const perLine = lines.map(() => 0);
  const applied: EngineApplied[] = [];
  const tiers = discounts.filter((d) => d.kind === "group" && d.type === "PERCENTAGE" && usable(d));
  if (tiers.length === 0) return { applied, perLine, totalCents: 0 };

  const byEvent = new Map<string, number[]>();
  lines.forEach((l, i) => {
    const list = byEvent.get(l.eventId) ?? [];
    list.push(i);
    byEvent.set(l.eventId, list);
  });

  for (const indexes of byEvent.values()) {
    const first = lines[indexes[0]];
    if (first.groupDiscountOff) continue;

    // Les paliers d'un lieu précis ne comptent que les places de ce lieu.
    const venues = new Set(tiers.map((t) => t.venueId));
    let best: { tier: EngineDiscount; amount: number; waives: boolean; paid: number[] } | null =
      null;
    for (const venueId of venues) {
      const own = tiers.filter((t) => t.organizerId === first.organizerId && t.venueId === venueId);
      if (own.length === 0) continue;
      const inScope = indexes.filter((i) => venueId == null || lines[i].venueId === venueId);
      const paid = inScope.filter((i) => isPaid(lines[i]));
      const companions = inScope.filter((i) => isFreeCompanion(lines[i]));
      const n = paid.reduce((s, i) => s + lines[i].quantity, 0);
      const base = paid.reduce((s, i) => s + lineValue(lines[i]), 0);
      const regular = companions.flatMap((i) => lines[i].companionRegularCents ?? []);
      const y = regular.length;
      const regularSum = regular.reduce((s, c) => s + c, 0);

      // Sans gratuité sur ce spectacle : la remise s'applique telle quelle.
      // Avec : soit on garde la gratuité (pas de remise), soit les places
      // gratuites passent au plein tarif et comptent dans le palier.
      const options: { tier: EngineDiscount; amount: number; waives: boolean }[] = [];
      if (y === 0) {
        const tier = bestTier(own, n, base);
        if (tier) options.push({ tier, amount: roundTo5((base * tier.value) / 10_000), waives: false });
      } else {
        const tier = bestTier(own, n + y, base + regularSum);
        if (tier) {
          const amount = roundTo5(((base + regularSum) * tier.value) / 10_000) - regularSum;
          options.push({ tier, amount, waives: true });
        }
      }
      for (const o of options) {
        const amount = Math.min(o.amount, base);
        if (amount > 0 && (!best || amount > best.amount)) best = { ...o, amount, paid };
      }
    }
    if (!best) continue;
    addApplied(applied, best.tier, best.amount, best.waives);
    spread(best.amount, best.paid, lines, perLine);
  }
  return { applied, perLine, totalCents: applied.reduce((s, a) => s + a.amountCents, 0) };
}

/**
 * Rabais d'une commande : la famille la plus avantageuse pour l'acheteur,
 * jamais deux rabais sur une même place. À égalité, le multi-séances.
 */
export function computeDiscounts(lines: EngineLine[], discounts: EngineDiscount[]): EngineResult {
  const sessions = sessionsCandidate(lines, discounts);
  const group = groupCandidate(lines, discounts);
  return group.totalCents > sessions.totalCents ? group : sessions;
}

/**
 * Recette d'un billet, rabais déduit. La part de rabais est portée par la
 * ligne de commande (un rabais de groupe ne touche que son spectacle) ; les
 * commandes antérieures n'en ont pas et se répartissent au prorata.
 */
export function ticketRevenueCents(
  order: {
    subtotalCents: number;
    discountCents: number;
    items: { ticketTypeId: string; unitPriceCents: number; quantity: number; discountCents: number }[];
  },
  ticketTypeId: string,
): number {
  const item = order.items.find((i) => i.ticketTypeId === ticketTypeId);
  if (!item) return 0;
  const allocated = order.items.some((i) => i.discountCents > 0);
  if (allocated || order.discountCents === 0) {
    return Math.round(item.unitPriceCents - item.discountCents / Math.max(1, item.quantity));
  }
  const share = order.subtotalCents > 0 ? 1 - order.discountCents / order.subtotalCents : 1;
  return Math.round(item.unitPriceCents * share);
}
