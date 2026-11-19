/**
 * Catalogue Stripe d'un organisateur : chaque tarif payant d'une date à venir
 * devient un produit, avec son prix. À la caisse, le lecteur Stripe (WisePad)
 * et l'app Stripe proposent ces produits : plus de montant à taper.
 *
 * Ce fichier ne parle pas à Stripe : il compare les tarifs de ticketick aux
 * produits déjà présents et en déduit ce qu'il faut créer, corriger ou retirer.
 */

/** Préfixe des produits créés par ticketick (`ticketick_<id du tarif>`). */
export const PRODUCT_PREFIX = "ticketick_";

export const META_ORGANIZER = "ticketick_organizer";
export const META_EVENT = "ticketick_event";
export const META_SESSION = "ticketick_session";
export const META_TICKET_TYPE = "ticketick_ticket_type";

export function productIdOf(ticketTypeId: string): string {
  return `${PRODUCT_PREFIX}${ticketTypeId}`;
}

/** Un tarif de ticketick tel qu'il doit apparaître dans Stripe. */
export interface CatalogTariff {
  ticketTypeId: string;
  sessionId: string;
  eventId: string;
  eventTitle: string;
  startsAt: Date;
  tariff: string;
  name: string;
  description: string;
  priceCents: number;
  /** En minuscules, comme Stripe. */
  currency: string;
  url: string | null;
  image: string | null;
}

/** Produit ticketick trouvé dans le compte Stripe. */
export interface CatalogProduct {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  url: string | null;
  images: string[];
  eventId: string | null;
  organizerId: string | null;
  price: { id: string; cents: number | null; currency: string; active: boolean } | null;
}

export type CatalogChange = "name" | "description" | "price" | "reactivate" | "url" | "image";

export type CatalogStep =
  | { kind: "create"; tariff: CatalogTariff }
  | { kind: "update"; tariff: CatalogTariff; product: CatalogProduct; changes: CatalogChange[] }
  | { kind: "keep"; tariff: CatalogTariff; product: CatalogProduct }
  | { kind: "archive"; product: CatalogProduct };

/**
 * Compare les tarifs aux produits. `eventId` limite le retrait aux produits de
 * ce spectacle : synchroniser un spectacle ne touche pas aux autres.
 */
export function planCatalog(
  tariffs: CatalogTariff[],
  products: CatalogProduct[],
  scope: { organizerId: string; eventId?: string },
): CatalogStep[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const wanted = new Set<string>();
  const steps: CatalogStep[] = [];

  for (const tariff of tariffs) {
    const id = productIdOf(tariff.ticketTypeId);
    wanted.add(id);
    const product = byId.get(id);
    if (!product) {
      steps.push({ kind: "create", tariff });
      continue;
    }
    const changes = changesOf(tariff, product);
    steps.push(
      changes.length > 0 ? { kind: "update", tariff, product, changes } : { kind: "keep", tariff, product },
    );
  }

  for (const product of products) {
    if (!product.active || wanted.has(product.id)) continue;
    // Produit d'un autre organisateur sur le même compte : on n'y touche pas.
    if (product.organizerId !== scope.organizerId) continue;
    if (scope.eventId && product.eventId !== scope.eventId) continue;
    steps.push({ kind: "archive", product });
  }
  return steps;
}

function changesOf(tariff: CatalogTariff, product: CatalogProduct): CatalogChange[] {
  const changes: CatalogChange[] = [];
  if (!product.active) changes.push("reactivate");
  if (product.name !== tariff.name) changes.push("name");
  if ((product.description ?? "") !== tariff.description) changes.push("description");
  if (tariff.url && product.url !== tariff.url) changes.push("url");
  if (tariff.image && product.images[0] !== tariff.image) changes.push("image");
  const price = product.price;
  if (
    !price ||
    !price.active ||
    price.cents !== tariff.priceCents ||
    price.currency !== tariff.currency
  ) {
    changes.push("price");
  }
  return changes;
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

/**
 * Nom du produit : la date en tête, pour que la recherche « 26.12 » dans l'app
 * Stripe trouve tous les tarifs du soir, puis le tarif et le spectacle.
 */
export function productName(input: {
  startsAt: Date;
  timeZone: string;
  tariff: string;
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
  return clip(`${when} · ${input.tariff} · ${title}`, 250);
}

export function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}
