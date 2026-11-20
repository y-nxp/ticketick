import "server-only";

import type Stripe from "stripe";
import { publicAppOrigin } from "@/lib/app-url";
import { prisma } from "@/lib/prisma";
import { t as translate, type Translated } from "@/lib/types";
import { EVENT_TIME_ZONE } from "@/lib/utils";
import {
  clip,
  countSteps,
  META_EVENT,
  META_ORGANIZER,
  META_SESSION,
  META_TICKET_TYPE,
  planCatalog,
  PRODUCT_PREFIX,
  productIdOf,
  productName,
  seasonNumbers,
  seasonOf,
  seasonRange,
  type CatalogCounts,
  type CatalogPrice,
  type CatalogProduct,
  type CatalogSession,
  type CatalogStep,
  type CatalogTariff,
  type TariffPlan,
} from "./stripe-catalog-plan";
import { stripeAccountForOrganizer, stripeClient, type StripeAccount } from "./stripe-account";

/**
 * Envoie les dates et tarifs d'un organisateur dans le catalogue de son compte
 * Stripe, pour la vente à la caisse. Voir `stripe-catalog-plan.ts`.
 */

/** Une date reste en vente à la caisse jusqu'à six heures après son début. */
const SELLABLE_AFTER_START_MS = 6 * 60 * 60 * 1000;
const CONCURRENCY = 4;

export type CatalogError = "noAccount" | "permission" | "credentials" | "stripe" | "busy";

export async function loadCatalogSessions(
  organizerId: string,
  options: { eventId?: string; now?: Date } = {},
): Promise<CatalogSession[]> {
  const now = options.now ?? new Date();
  const sessions = await prisma.eventSession.findMany({
    where: {
      startsAt: { gte: new Date(now.getTime() - SELLABLE_AFTER_START_MS) },
      status: { in: ["PUBLISHED", "SOLD_OUT"] },
      event: {
        organizerId,
        status: { in: ["PUBLISHED", "SOLD_OUT"] },
        ...(options.eventId ? { id: options.eventId } : {}),
      },
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      label: true,
      venue: { select: { name: true, city: true } },
      event: {
        select: {
          id: true,
          slug: true,
          title: true,
          coverImage: true,
          organizer: { select: { name: true } },
        },
      },
      // Un tarif gratuit ne s'encaisse pas : il reste hors du catalogue.
      ticketTypes: {
        where: { priceCents: { gt: 0 } },
        orderBy: [{ priceCents: "desc" }, { id: "asc" }],
        select: { id: true, name: true, priceCents: true, currency: true },
      },
    },
  });

  const origin = publicAppOrigin();
  const longDate = new Intl.DateTimeFormat("fr-CH", {
    timeZone: EVENT_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const numbers = await seasonNumbersOf(organizerId, sessions);

  return sessions
    .filter((session) => session.ticketTypes.length > 0)
    .map((session) => {
      const event = session.event;
      const eventTitle = translate(event.title as Translated, "fr");
      const sessionLabel = session.label ? translate(session.label as Translated, "fr") : null;
      const venue = session.venue ? `${session.venue.name}, ${session.venue.city}` : null;
      return {
        sessionId: session.id,
        eventId: event.id,
        eventTitle,
        startsAt: session.startsAt,
        name: productName({
          startsAt: session.startsAt,
          timeZone: EVENT_TIME_ZONE,
          eventTitle,
          sessionLabel,
          number: numbers.get(session.id),
        }),
        description: clip(
          [event.organizer.name, venue, longDate.format(session.startsAt)].filter(Boolean).join(" · "),
          500,
        ),
        url: origin.startsWith("https://") ? `${origin}/events/${event.slug}` : null,
        image: imageUrl(event.coverImage, origin),
        tariffs: session.ticketTypes.map((tt) => ({
          ticketTypeId: tt.id,
          tariff: clip(translate(tt.name as Translated, "fr"), 250),
          priceCents: tt.priceCents,
          currency: tt.currency.toLowerCase(),
        })),
      };
    });
}

/**
 * Numéros des dates dans leur saison, comptés sur toutes les dates de
 * l'organisateur qui ont un tarif payant, passées comprises, et quel que soit
 * le spectacle synchronisé.
 */
async function seasonNumbersOf(
  organizerId: string,
  sessions: { startsAt: Date }[],
): Promise<Map<string, string>> {
  const seasons = [...new Set(sessions.map((s) => seasonOf(s.startsAt, EVENT_TIME_ZONE)))];
  if (seasons.length === 0) return new Map();
  const all = await prisma.eventSession.findMany({
    where: {
      OR: seasons.map((season) => {
        const { from, to } = seasonRange(season);
        return { startsAt: { gte: from, lt: to } };
      }),
      status: { in: ["PUBLISHED", "SOLD_OUT", "PAST"] },
      event: { organizerId, status: { in: ["PUBLISHED", "SOLD_OUT", "PAST"] } },
      ticketTypes: { some: { priceCents: { gt: 0 } } },
    },
    select: { id: true, startsAt: true },
  });
  const wanted = new Set(seasons);
  return seasonNumbers(
    all.filter((s) => wanted.has(seasonOf(s.startsAt, EVENT_TIME_ZONE))),
    EVENT_TIME_ZONE,
  );
}

/** Stripe n'accepte que des images joignables en HTTPS. */
function imageUrl(cover: string | null, origin: string): string | null {
  if (!cover) return null;
  const url = cover.startsWith("/") ? `${origin}${cover}` : cover;
  return url.startsWith("https://") && url.length <= 2048 ? url : null;
}

/** Produits ticketick du compte (actifs ou archivés) et leurs prix actifs. */
export async function listCatalogProducts(stripe: Stripe): Promise<CatalogProduct[]> {
  const prices = new Map<string, CatalogPrice[]>();
  for await (const price of stripe.prices.list({ limit: 100, active: true })) {
    const productId = typeof price.product === "string" ? price.product : price.product.id;
    if (!productId.startsWith(PRODUCT_PREFIX)) continue;
    const list = prices.get(productId) ?? [];
    list.push(priceOf(price));
    prices.set(productId, list);
  }
  const products: CatalogProduct[] = [];
  for await (const product of stripe.products.list({ limit: 100 })) {
    if (!product.id.startsWith(PRODUCT_PREFIX)) continue;
    products.push(productOf(product, prices.get(product.id) ?? []));
  }
  return products;
}

function priceOf(price: Stripe.Price): CatalogPrice {
  return {
    id: price.id,
    ticketTypeId: price.metadata?.[META_TICKET_TYPE] ?? null,
    nickname: price.nickname ?? null,
    cents: price.unit_amount,
    currency: price.currency,
  };
}

function productOf(product: Stripe.Product, prices: CatalogPrice[]): CatalogProduct {
  const defaultPrice = product.default_price;
  return {
    id: product.id,
    name: product.name,
    description: product.description ?? null,
    active: product.active,
    url: product.url ?? null,
    images: product.images ?? [],
    eventId: product.metadata?.[META_EVENT] ?? null,
    organizerId: product.metadata?.[META_ORGANIZER] ?? null,
    defaultPriceId: typeof defaultPrice === "string" ? defaultPrice : (defaultPrice?.id ?? null),
    prices,
  };
}

export interface CatalogPreview {
  account: { name: string | null; live: boolean; syncedAt: Date | null };
  steps: CatalogStep[];
  counts: CatalogCounts;
}

export async function previewStripeCatalog(
  organizerId: string,
): Promise<{ ok: true; preview: CatalogPreview } | { ok: false; error: CatalogError }> {
  const account = await stripeAccountForOrganizer(organizerId);
  if (!account) return { ok: false, error: "noAccount" };
  try {
    const [sessions, products, row] = await Promise.all([
      loadCatalogSessions(organizerId),
      listCatalogProducts(stripeClient(account.secretKey)),
      prisma.organizerStripeAccount.findUnique({
        where: { organizerId },
        select: { accountName: true, catalogSyncedAt: true },
      }),
    ]);
    const steps = planCatalog(sessions, products, { organizerId });
    return {
      ok: true,
      preview: {
        account: { name: row?.accountName ?? null, live: account.live, syncedAt: row?.catalogSyncedAt ?? null },
        steps,
        counts: countSteps(steps),
      },
    };
  } catch (error) {
    return { ok: false, error: stripeErrorKind(error) };
  }
}

/** Nombre de dates (produits) créées, mises à jour, retirées, inchangées. */
export interface CatalogSyncResult {
  created: number;
  updated: number;
  archived: number;
  unchanged: number;
  failed: number;
}

const running = new Set<string>();

/**
 * Applique le plan dans le compte Stripe. Les identifiants des produits sont
 * fixés par ticketick : relancer la synchronisation ne crée jamais de doublon.
 */
export async function syncStripeCatalog(
  organizerId: string,
  options: { eventId?: string } = {},
): Promise<{ ok: true; result: CatalogSyncResult } | { ok: false; error: CatalogError }> {
  const account = await stripeAccountForOrganizer(organizerId);
  if (!account) return { ok: false, error: "noAccount" };
  if (running.has(organizerId)) return { ok: false, error: "busy" };
  running.add(organizerId);
  try {
    const stripe = stripeClient(account.secretKey);
    const [sessions, products] = await Promise.all([
      loadCatalogSessions(organizerId, { eventId: options.eventId }),
      listCatalogProducts(stripe),
    ]);
    const steps = planCatalog(sessions, products, { organizerId, eventId: options.eventId });
    const result: CatalogSyncResult = { created: 0, updated: 0, archived: 0, unchanged: 0, failed: 0 };
    let blocking: CatalogError | null = null;

    await eachLimited(steps, CONCURRENCY, async (step) => {
      if (blocking) return;
      try {
        if (step.kind === "keep") result.unchanged += 1;
        else if (step.kind === "archive") {
          await retireProduct(stripe, step.product);
          result.archived += 1;
        } else if (step.kind === "update") {
          await updateProduct(stripe, account, step.session, step.product, step.tariffs, step.archivePrices);
          result.updated += 1;
        } else {
          const created = await createProduct(stripe, account, step.session);
          result[created ? "created" : "updated"] += 1;
        }
      } catch (error) {
        const kind = stripeErrorKind(error);
        // Clé refusée ou sans droit : inutile d'insister produit par produit.
        if (kind === "permission" || kind === "credentials") blocking = kind;
        result.failed += 1;
        console.warn("[stripe-catalog]", organizerId, step.kind, error instanceof Error ? error.message : error);
      }
    });

    if (blocking && result.created + result.updated + result.archived === 0) {
      return { ok: false, error: blocking };
    }
    if (result.failed === 0) {
      await prisma.organizerStripeAccount.update({
        where: { organizerId },
        data: { catalogSyncedAt: new Date() },
      });
    }
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: stripeErrorKind(error) };
  } finally {
    running.delete(organizerId);
  }
}

function productMetadata(account: StripeAccount, session: CatalogSession): Stripe.MetadataParam {
  return {
    [META_ORGANIZER]: account.organizerId,
    [META_EVENT]: session.eventId,
    [META_SESSION]: session.sessionId,
  };
}

function productFields(session: CatalogSession) {
  return {
    name: session.name,
    description: session.description,
    ...(session.url ? { url: session.url } : {}),
    ...(session.image ? { images: [session.image] } : {}),
  };
}

async function createPrice(
  stripe: Stripe,
  account: StripeAccount,
  productId: string,
  session: CatalogSession,
  tariff: CatalogTariff,
): Promise<string> {
  const price = await stripe.prices.create({
    product: productId,
    currency: tariff.currency,
    unit_amount: tariff.priceCents,
    nickname: tariff.tariff,
    // Prix suisses TVA comprise.
    tax_behavior: "inclusive",
    metadata: {
      [META_ORGANIZER]: account.organizerId,
      [META_SESSION]: session.sessionId,
      [META_TICKET_TYPE]: tariff.ticketTypeId,
    },
  });
  return price.id;
}

/** `true` : créé ; `false` : il existait déjà (double clic), mis à jour. */
async function createProduct(
  stripe: Stripe,
  account: StripeAccount,
  session: CatalogSession,
): Promise<boolean> {
  const id = productIdOf(session.sessionId);
  try {
    await stripe.products.create({ id, ...productFields(session), metadata: productMetadata(account, session) });
  } catch (error) {
    if ((error as { code?: string })?.code !== "resource_already_exists") throw error;
    // Créé entre-temps par un autre clic : on repart de ce qui existe.
    const [existing] = (await listCatalogProducts(stripe)).filter((p) => p.id === id);
    const [step] = planCatalog([session], existing ? [existing] : [], { organizerId: account.organizerId });
    if (step?.kind === "update") {
      await updateProduct(stripe, account, session, step.product, step.tariffs, step.archivePrices);
    }
    return false;
  }
  const priceIds: string[] = [];
  for (const tariff of session.tariffs) {
    priceIds.push(await createPrice(stripe, account, id, session, tariff));
  }
  if (priceIds[0]) await stripe.products.update(id, { default_price: priceIds[0] });
  return true;
}

/**
 * Un montant Stripe ne se modifie pas : nouveau prix, puis l'ancien est
 * archivé (les paiements passés le gardent). Le prix par défaut change avant
 * l'archivage, Stripe refusant d'archiver le prix par défaut.
 */
async function updateProduct(
  stripe: Stripe,
  account: StripeAccount,
  session: CatalogSession,
  product: CatalogProduct,
  tariffs: TariffPlan[],
  archivePrices: CatalogPrice[],
): Promise<void> {
  const priceIds: string[] = [];
  for (const { tariff, state } of tariffs) {
    if (state.kind === "keep") priceIds.push(state.price.id);
    else if (state.kind === "rename") {
      await stripe.prices.update(state.price.id, { nickname: tariff.tariff });
      priceIds.push(state.price.id);
    } else {
      priceIds.push(await createPrice(stripe, account, product.id, session, tariff));
    }
  }
  const defaultPrice = priceIds[0];
  await stripe.products.update(product.id, {
    ...productFields(session),
    active: true,
    metadata: productMetadata(account, session),
    ...(defaultPrice && defaultPrice !== product.defaultPriceId ? { default_price: defaultPrice } : {}),
  });
  for (const price of archivePrices) {
    if (price.id !== defaultPrice) await stripe.prices.update(price.id, { active: false });
  }
}

/**
 * Retire un produit de la vente : ses prix sont archivés (un prix ne se
 * supprime pas par l'API), puis le produit est supprimé. Stripe refuse la
 * suppression d'un produit qui garde des prix : il reste alors archivé.
 */
async function retireProduct(stripe: Stripe, product: CatalogProduct): Promise<void> {
  if (product.active) await stripe.products.update(product.id, { active: false });
  // Stripe refuse d'archiver le prix par défaut : on le détache d'abord. Chaque
  // étape suivante est tentée pour elle-même ; au pire le produit reste archivé.
  if (product.defaultPriceId) {
    await quietly(product.id, () => stripe.products.update(product.id, { default_price: "" }));
  }
  for (const price of product.prices) {
    await quietly(price.id, () => stripe.prices.update(price.id, { active: false }));
  }
  await quietly(product.id, () => stripe.products.del(product.id));
}

async function quietly(id: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    console.info("[stripe-catalog] étape de retrait refusée", id, error instanceof Error ? error.message : error);
  }
}

async function eachLimited<T>(items: T[], limit: number, run: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await run(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function stripeErrorKind(error: unknown): CatalogError {
  const type = (error as { type?: string })?.type;
  if (type === "StripePermissionError") return "permission";
  if (type === "StripeAuthenticationError") return "credentials";
  if (!type?.startsWith("Stripe")) console.error("[stripe-catalog]", error);
  return "stripe";
}
