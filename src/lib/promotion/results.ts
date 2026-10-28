import type { OrderStatus, PromotionPostStatus } from "@prisma/client";
import { clickDay } from "./landing";
import { PROMOTION_SOURCES } from "./source";

/**
 * Résultats d'une campagne (docs/module-promotion.md, § 5.2) : une seule
 * fonction de calcul pour la page de la campagne, la liste et le rapport
 * courriel, pour que les trois disent toujours le même chiffre.
 *
 * Règles :
 * - seules les commandes `PAID` sont passées ici (le chargement les filtre) :
 *   une commande remboursée ou annulée sort des totaux, on affiche le net ;
 * - deux lignes jamais confondues : billets de l'événement promu, et autres
 *   spectacles du même organisateur achetés dans la foulée. Les billets d'un
 *   autre organisateur (panier mêlé) ne comptent nulle part ;
 * - montant d'un billet : `OrderItem.unitPriceCents`, moins sa part du rabais
 *   de la commande, au prorata (comme `getOrganizerReport`). Les frais de
 *   service (`feeCents`) n'entrent jamais : c'est l'argent de l'organisateur ;
 * - options de commande (`OrderOption`) à part, avec leur part de rabais ;
 * - billets gratuits : comptés en billets, à 0 CHF.
 *
 * Remboursement partiel : une commande qui reste `PAID` peut avoir des
 * billets annulés depuis l'admin (`TicketStatus.CANCELLED`), ou des places
 * ajoutées pas encore réglées (`PENDING`). Seuls les billets `VALID` et
 * `USED` comptent, au prix de leur `OrderItem` : jamais plus que ce qui a été
 * payé, comme dans le rapport de l'organisateur.
 *
 * Sans `server-only` ni Prisma : les données arrivent en paramètre
 * (`results-store.ts`), les tests tournent sans base.
 */

/** Billets qui comptent dans une commande payée. */
export const COUNTED_TICKET_STATUSES = ["VALID", "USED"] as const;

export interface ResultOrder {
  id: string;
  campaignId: string;
  /** Seul `PAID` compte ; le chargement ne lit déjà que celles-là. */
  status: OrderStatus;
  /** Source du clic figée sur la commande (`Order.promotionSource`). */
  source: string | null;
  createdAt: Date;
  subtotalCents: number;
  /** Somme des `OrderDiscount` de la commande. */
  discountCents: number;
  items: { ticketTypeId: string; quantity: number; unitPriceCents: number }[];
  /** Billets `VALID` ou `USED`, un par place. */
  tickets: { ticketTypeId: string }[];
  /** Options choisies, avec l'organisateur de leur spectacle. */
  options: { amountCents: number; organizerId: string }[];
}

/** Spectacle et organisateur d'un tarif. */
export interface TicketTypeOwner {
  eventId: string;
  organizerId: string;
}

export interface ResultCampaign {
  id: string;
  organizerId: string;
  eventId: string;
}

export interface SalesLine {
  tickets: number;
  cents: number;
}

/** Part d'une commande dans les résultats de sa campagne. */
export interface OrderShare {
  /** Billets de l'événement promu : le chiffre principal. */
  event: SalesLine;
  /** Autres spectacles du même organisateur. */
  other: SalesLine;
  optionsCents: number;
}

type Bucket = "event" | "other" | "options" | "foreign";

/**
 * Répartit `target` centimes sur des lignes, au prorata de leur montant brut,
 * par la méthode du plus fort reste : la somme tombe juste, aucune ligne ne
 * passe en négatif et un billet gratuit ne reçoit jamais un centime.
 */
export function allocateCents(gross: readonly number[], target: number): number[] {
  const base = gross.reduce((n, g) => n + g, 0);
  if (base <= 0 || target <= 0) return gross.map(() => 0);
  const exact = gross.map((g) => ({ floor: Math.floor((g * target) / base), rest: (g * target) % base }));
  let left = target - exact.reduce((n, e) => n + e.floor, 0);
  const out = exact.map((e) => e.floor);
  const order = exact
    .map((e, i) => ({ i, rest: e.rest }))
    .filter((e) => e.rest > 0)
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i]! += 1;
    left -= 1;
  }
  return out;
}

/**
 * Lignes d'une commande : chaque billet compté au prix de son tarif dans la
 * commande. Deux `OrderItem` d'un même tarif (places ajoutées après coup)
 * sont pris dans l'ordre, au prix de chacun.
 */
function ticketLines(order: ResultOrder): { ticketTypeId: string; count: number; gross: number }[] {
  const counted = new Map<string, number>();
  for (const t of order.tickets) counted.set(t.ticketTypeId, (counted.get(t.ticketTypeId) ?? 0) + 1);
  const lines: { ticketTypeId: string; count: number; gross: number }[] = [];
  for (const [ticketTypeId, total] of counted) {
    const items = order.items.filter((i) => i.ticketTypeId === ticketTypeId);
    if (items.length === 0) continue;
    let left = total;
    items.forEach((item, index) => {
      const take = index === items.length - 1 ? left : Math.min(item.quantity, left);
      if (take <= 0) return;
      left -= take;
      lines.push({ ticketTypeId, count: take, gross: item.unitPriceCents * take });
    });
  }
  return lines;
}

const emptyShare = (): OrderShare => ({
  event: { tickets: 0, cents: 0 },
  other: { tickets: 0, cents: 0 },
  optionsCents: 0,
});

/**
 * Part d'une commande payée : billets et options, rabais déduit au prorata,
 * frais exclus. Le rabais se répartit sur toute la commande (billets d'autres
 * organisateurs compris), comme il a été calculé à l'achat.
 */
export function orderShare(
  order: ResultOrder,
  campaign: ResultCampaign,
  owners: ReadonlyMap<string, TicketTypeOwner>,
): OrderShare {
  const lines: { bucket: Bucket; count: number; gross: number }[] = [];
  for (const line of ticketLines(order)) {
    const owner = owners.get(line.ticketTypeId);
    const bucket: Bucket =
      !owner || owner.organizerId !== campaign.organizerId
        ? "foreign"
        : owner.eventId === campaign.eventId
          ? "event"
          : "other";
    lines.push({ bucket, count: line.count, gross: line.gross });
  }
  for (const option of order.options) {
    lines.push({
      bucket: option.organizerId === campaign.organizerId ? "options" : "foreign",
      count: 0,
      gross: Math.max(0, option.amountCents),
    });
  }

  // Part payée de chaque franc du sous-total : la règle de `getOrganizerReport`.
  // Sans billet annulé, la somme des lignes vaut exactement sous-total − rabais.
  const gross = lines.map((l) => l.gross);
  const base = gross.reduce((n, g) => n + g, 0);
  const subtotal = order.subtotalCents > 0 ? order.subtotalCents : base;
  const discount = Math.min(Math.max(0, order.discountCents), subtotal);
  const target = subtotal > 0 ? Math.round((base * (subtotal - discount)) / subtotal) : 0;
  const net = allocateCents(gross, target);

  const share = emptyShare();
  lines.forEach((line, i) => {
    const cents = net[i]!;
    if (line.bucket === "options") share.optionsCents += cents;
    else if (line.bucket !== "foreign") {
      share[line.bucket].tickets += line.count;
      share[line.bucket].cents += cents;
    }
  });
  return share;
}

/**
 * Part d'une commande qui compte : payée, et avec au moins un billet de
 * l'organisateur encore valable. `null` sinon.
 */
function countedShare(
  order: ResultOrder,
  campaign: ResultCampaign,
  owners: ReadonlyMap<string, TicketTypeOwner>,
): OrderShare | null {
  if (order.status !== "PAID" || order.campaignId !== campaign.id) return null;
  const share = orderShare(order, campaign, owners);
  return share.event.tickets + share.other.tickets > 0 ? share : null;
}

export interface CampaignFigures {
  clicks: number;
  orders: number;
  event: SalesLine;
  other: SalesLine;
  optionsCents: number;
}

export function emptyFigures(clicks = 0): CampaignFigures {
  return { clicks, orders: 0, ...emptyShare() };
}

function addShare(into: CampaignFigures, share: OrderShare): void {
  into.orders += 1;
  into.event.tickets += share.event.tickets;
  into.event.cents += share.event.cents;
  into.other.tickets += share.other.tickets;
  into.other.cents += share.other.cents;
  into.optionsCents += share.optionsCents;
}

/**
 * Totaux de plusieurs campagnes à la fois, pour la liste et le rapport :
 * une seule passe sur les commandes déjà chargées.
 */
export function campaignFigures(
  campaigns: readonly ResultCampaign[],
  orders: readonly ResultOrder[],
  owners: ReadonlyMap<string, TicketTypeOwner>,
  clicks: ReadonlyMap<string, number>,
): Map<string, CampaignFigures> {
  const byId = new Map(campaigns.map((c) => [c.id, c]));
  const out = new Map(campaigns.map((c) => [c.id, emptyFigures(clicks.get(c.id) ?? 0)]));
  for (const order of orders) {
    const campaign = byId.get(order.campaignId);
    const share = campaign ? countedShare(order, campaign, owners) : null;
    if (campaign && share) addShare(out.get(campaign.id)!, share);
  }
  return out;
}

/** Taux clics → commandes ; `null` sans clic : on n'invente pas de taux. */
export function conversionRate(figures: Pick<CampaignFigures, "clicks" | "orders">): number | null {
  return figures.clicks > 0 ? figures.orders / figures.clicks : null;
}

// ─── Détail d'une campagne ────────────────────────────────────────────────

export interface ClickRow {
  /** `PromotionClickDay.day` : date seule, à minuit UTC. */
  day: Date;
  source: string;
  clicks: number;
}

/** Sources dans l'ordre de `PROMOTION_SOURCES`, les inconnues à la fin. */
export function sortSources(sources: Iterable<string>): string[] {
  const rank = (s: string) => {
    const i = (PROMOTION_SOURCES as readonly string[]).indexOf(s);
    return i === -1 ? PROMOTION_SOURCES.length : i;
  };
  return [...new Set(sources)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export interface DayRow {
  /** `AAAA-MM-JJ`, jour à Zurich. */
  day: string;
  clicks: number;
  clicksBySource: Record<string, number>;
  orders: number;
  /** Billets de l'événement promu et des autres spectacles. */
  tickets: number;
  cents: number;
}

export interface SourceRow {
  source: string;
  clicks: number;
  orders: number;
  tickets: number;
  cents: number;
}

export interface CampaignDetail extends CampaignFigures {
  /** Sources présentes, dans l'ordre d'affichage. */
  sources: string[];
  bySource: SourceRow[];
  /** Jours avec au moins un clic ou une vente, du plus ancien au plus récent. */
  days: DayRow[];
}

/** Clé de jour d'une ligne `PromotionClickDay` (déjà un jour à Zurich). */
function storedDay(day: Date): string {
  return day.toISOString().slice(0, 10);
}

/**
 * Détail d'une campagne : clics par jour et par source, ventes par jour (jour
 * de la commande, à Zurich) et par source du clic. Une vente sans source
 * connue se range sous « link », la source par défaut des clics.
 */
export function campaignDetail(
  campaign: ResultCampaign,
  orders: readonly ResultOrder[],
  owners: ReadonlyMap<string, TicketTypeOwner>,
  clickRows: readonly ClickRow[],
): CampaignDetail {
  const figures = emptyFigures();
  const days = new Map<string, DayRow>();
  const sourceRows = new Map<string, SourceRow>();
  const dayRow = (day: string) => {
    let row = days.get(day);
    if (!row) {
      row = { day, clicks: 0, clicksBySource: {}, orders: 0, tickets: 0, cents: 0 };
      days.set(day, row);
    }
    return row;
  };
  const sourceRow = (source: string) => {
    let row = sourceRows.get(source);
    if (!row) {
      row = { source, clicks: 0, orders: 0, tickets: 0, cents: 0 };
      sourceRows.set(source, row);
    }
    return row;
  };

  for (const click of clickRows) {
    if (click.clicks <= 0) continue;
    const row = dayRow(storedDay(click.day));
    row.clicks += click.clicks;
    row.clicksBySource[click.source] = (row.clicksBySource[click.source] ?? 0) + click.clicks;
    sourceRow(click.source).clicks += click.clicks;
    figures.clicks += click.clicks;
  }

  for (const order of orders) {
    const share = countedShare(order, campaign, owners);
    if (!share) continue;
    addShare(figures, share);
    const tickets = share.event.tickets + share.other.tickets;
    const cents = share.event.cents + share.other.cents;
    for (const row of [dayRow(clickDay(order.createdAt)), sourceRow(order.source || "link")]) {
      row.orders += 1;
      row.tickets += tickets;
      row.cents += cents;
    }
  }

  const sources = sortSources(sourceRows.keys());
  return {
    ...figures,
    sources,
    bySource: sources.map((s) => sourceRows.get(s)!),
    days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
  };
}

// ─── État d'une campagne ──────────────────────────────────────────────────

/** Ordre de priorité : ce qui demande l'attention d'abord, après le publié. */
const STATE_PRIORITY: readonly PromotionPostStatus[] = [
  "PUBLISHED",
  "PUBLISHING",
  "SCHEDULED",
  "FAILED",
  "DRAFT",
  "CANCELLED",
];

/**
 * État affiché d'une campagne, déduit de ses publications : publiée dès
 * qu'une l'est, sinon en cours, programmée, en échec, en brouillon, annulée.
 * `null` sans publication.
 */
export function campaignState(statuses: readonly PromotionPostStatus[]): PromotionPostStatus | null {
  return STATE_PRIORITY.find((s) => statuses.includes(s)) ?? null;
}

/** Publications qui rendent une campagne active (rapport courriel). */
export const ACTIVE_POST_STATUSES = ["PUBLISHED", "PUBLISHING", "SCHEDULED"] as const satisfies readonly PromotionPostStatus[];

/**
 * Campagne active, pour le rapport courriel : au moins une publication
 * publiée, en cours ou programmée.
 */
export function isActiveCampaign(statuses: readonly PromotionPostStatus[]): boolean {
  return statuses.some((s) => (ACTIVE_POST_STATUSES as readonly string[]).includes(s));
}
