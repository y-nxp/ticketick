/**
 * Catalogue Stripe d'un organisateur : chaque date à venir devient un produit,
 * et chacun de ses tarifs payants un prix de ce produit (Premium, Catégorie 1…).
 * À la caisse (Collect for Stripe, lecteur WisePad), on choisit le concert,
 * puis le tarif.
 *
 * Ce fichier ne parle pas à Stripe : il compare les dates et tarifs de
 * ticketick aux produits déjà présents et en déduit ce qu'il faut créer,
 * corriger ou retirer.
 */

/** Préfixe de tout produit créé par ticketick. */
export const PRODUCT_PREFIX = "ticketick_";
/** Produit d'une date (`ticketick_s_<séance>`). */
export const SESSION_PRODUCT_PREFIX = "ticketick_s_";

export const META_ORGANIZER = "ticketick_organizer";
export const META_EVENT = "ticketick_event";
export const META_SESSION = "ticketick_session";
export const META_TICKET_TYPE = "ticketick_ticket_type";

export function productIdOf(sessionId: string): string {
  return `${SESSION_PRODUCT_PREFIX}${sessionId}`;
}

export interface CatalogTariff {
  ticketTypeId: string;
  tariff: string;
  priceCents: number;
  /** En minuscules, comme Stripe. */
  currency: string;
}

/** Une date de ticketick telle qu'elle doit apparaître dans Stripe. */
export interface CatalogSession {
  sessionId: string;
  eventId: string;
  eventTitle: string;
  startsAt: Date;
  name: string;
  description: string;
  url: string | null;
  image: string | null;
  /** Du plus cher au moins cher : le premier est le prix par défaut. */
  tariffs: CatalogTariff[];
}

/** Prix actif d'un produit ticketick. */
export interface CatalogPrice {
  id: string;
  ticketTypeId: string | null;
  nickname: string | null;
  cents: number | null;
  currency: string;
}

export interface CatalogProduct {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  url: string | null;
  images: string[];
  eventId: string | null;
  organizerId: string | null;
  defaultPriceId: string | null;
  prices: CatalogPrice[];
}

export type TariffState =
  | { kind: "create" }
  | { kind: "keep"; price: CatalogPrice }
  | { kind: "rename"; price: CatalogPrice }
  | { kind: "reprice"; old: CatalogPrice };

export interface TariffPlan {
  tariff: CatalogTariff;
  state: TariffState;
}

export type CatalogChange = "name" | "description" | "url" | "image" | "reactivate" | "prices" | "default";

export type CatalogStep =
  | { kind: "create"; session: CatalogSession; tariffs: TariffPlan[] }
  | {
      kind: "update";
      session: CatalogSession;
      product: CatalogProduct;
      tariffs: TariffPlan[];
      changes: CatalogChange[];
      /** Prix actifs à archiver : ancien montant, tarif supprimé ou doublon. */
      archivePrices: CatalogPrice[];
    }
  | { kind: "keep"; session: CatalogSession; product: CatalogProduct; tariffs: TariffPlan[] }
  | { kind: "archive"; product: CatalogProduct };

/**
 * Compare les dates aux produits. `eventId` limite le retrait aux produits de
 * ce spectacle : synchroniser un spectacle ne touche pas aux autres.
 * Les anciens produits « un par tarif » (`ticketick_<tarif>`) ne sont plus
 * voulus : ils sont retirés de la vente.
 */
export function planCatalog(
  sessions: CatalogSession[],
  products: CatalogProduct[],
  scope: { organizerId: string; eventId?: string },
): CatalogStep[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const wanted = new Set<string>();
  const steps: CatalogStep[] = [];

  for (const session of sessions) {
    const id = productIdOf(session.sessionId);
    wanted.add(id);
    const product = byId.get(id);
    if (!product) {
      steps.push({
        kind: "create",
        session,
        tariffs: session.tariffs.map((tariff) => ({ tariff, state: { kind: "create" } })),
      });
      continue;
    }

    const { tariffs, archivePrices } = planPrices(session.tariffs, product.prices);
    const changes: CatalogChange[] = [];
    if (!product.active) changes.push("reactivate");
    if (product.name !== session.name) changes.push("name");
    if ((product.description ?? "") !== session.description) changes.push("description");
    if (session.url && product.url !== session.url) changes.push("url");
    if (session.image && product.images[0] !== session.image) changes.push("image");
    if (archivePrices.length > 0 || tariffs.some((t) => t.state.kind !== "keep")) changes.push("prices");
    const first = tariffs[0]?.state;
    if (first && (first.kind === "keep" || first.kind === "rename") && product.defaultPriceId !== first.price.id) {
      changes.push("default");
    }

    steps.push(
      changes.length > 0
        ? { kind: "update", session, product, tariffs, changes, archivePrices }
        : { kind: "keep", session, product, tariffs },
    );
  }

  for (const product of products) {
    if (wanted.has(product.id)) continue;
    // Déjà archivé sans prix actif : rien de plus à faire. Un produit archivé
    // dont les prix sont restés actifs reste visible dans Collect for Stripe.
    if (!product.active && product.prices.length === 0) continue;
    // Produit d'un autre organisateur sur le même compte : on n'y touche pas.
    if (product.organizerId !== scope.organizerId) continue;
    if (scope.eventId && product.eventId !== scope.eventId) continue;
    steps.push({ kind: "archive", product });
  }
  return steps;
}

function planPrices(
  tariffs: CatalogTariff[],
  prices: CatalogPrice[],
): { tariffs: TariffPlan[]; archivePrices: CatalogPrice[] } {
  const used = new Set<string>();
  const plans = tariffs.map((tariff): TariffPlan => {
    const mine = prices.filter((p) => p.ticketTypeId === tariff.ticketTypeId);
    const same = mine.find((p) => p.cents === tariff.priceCents && p.currency === tariff.currency);
    if (same) {
      used.add(same.id);
      return {
        tariff,
        state: same.nickname === tariff.tariff ? { kind: "keep", price: same } : { kind: "rename", price: same },
      };
    }
    return { tariff, state: mine[0] ? { kind: "reprice", old: mine[0] } : { kind: "create" } };
  });
  return { tariffs: plans, archivePrices: prices.filter((p) => !used.has(p.id)) };
}

export interface CatalogCounts {
  create: number;
  update: number;
  keep: number;
  archive: number;
}

export function countSteps(steps: CatalogStep[]): CatalogCounts {
  const counts: CatalogCounts = { create: 0, update: 0, keep: 0, archive: 0 };
  for (const step of steps) counts[step.kind] += 1;
  return counts;
}

/** Nom du produit : la date en tête, puis le spectacle. */
export function productName(input: {
  startsAt: Date;
  timeZone: string;
  eventTitle: string;
  sessionLabel?: string | null;
}): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("fr-CH", {
      timeZone: input.timeZone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(input.startsAt)
      .map((p) => [p.type, p.value]),
  );
  const when = `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}`;
  const title = input.sessionLabel ? `${input.eventTitle} (${input.sessionLabel})` : input.eventTitle;
  return clip(`${when} · ${title}`, 250);
}

export function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}
