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
  type CatalogCounts,
  type CatalogProduct,
  type CatalogStep,
  type CatalogTariff,
} from "./stripe-catalog-plan";
import { stripeAccountForOrganizer, stripeClient, type StripeAccount } from "./stripe-account";

/**
 * Envoie les tarifs d'un organisateur dans le catalogue de son compte Stripe,
 * pour la vente à la caisse avec le lecteur Stripe. Voir `stripe-catalog-plan.ts`.
 */

/** Une date reste en vente à la caisse jusqu'à six heures après son début. */
const SELLABLE_AFTER_START_MS = 6 * 60 * 60 * 1000;
const CONCURRENCY = 4;

export type CatalogError = "noAccount" | "permission" | "credentials" | "stripe" | "busy";

export async function loadCatalogTariffs(
  organizerId: string,
  options: { eventId?: string; now?: Date } = {},
): Promise<CatalogTariff[]> {
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

  return sessions.flatMap((session) => {
    const event = session.event;
    const eventTitle = translate(event.title as Translated, "fr");
    const sessionLabel = session.label ? translate(session.label as Translated, "fr") : null;
    const venue = session.venue ? `${session.venue.name}, ${session.venue.city}` : null;
    const description = clip(
      [event.organizer.name, venue, longDate.format(session.startsAt)].filter(Boolean).join(" · "),
      500,
    );
    return session.ticketTypes.map((tt) => {
      const tariff = translate(tt.name as Translated, "fr");
      return {
        ticketTypeId: tt.id,
        sessionId: session.id,
        eventId: event.id,
        eventTitle,
        startsAt: session.startsAt,
        tariff,
        name: productName({
          startsAt: session.startsAt,
          timeZone: EVENT_TIME_ZONE,
          tariff,
          eventTitle,
          sessionLabel,
        }),
        description,
        priceCents: tt.priceCents,
        currency: tt.currency.toLowerCase(),
        url: origin.startsWith("https://") ? `${origin}/events/${event.slug}` : null,
        image: imageUrl(event.coverImage, origin),
      };
    });
  });
}

/** Stripe n'accepte que des images joignables en HTTPS. */
function imageUrl(cover: string | null, origin: string): string | null {
  if (!cover) return null;
  const url = cover.startsWith("/") ? `${origin}${cover}` : cover;
  return url.startsWith("https://") && url.length <= 2048 ? url : null;
}

/** Produits ticketick du compte, actifs ou archivés. */
export async function listCatalogProducts(stripe: Stripe): Promise<CatalogProduct[]> {
  const products: CatalogProduct[] = [];
  for await (const product of stripe.products.list({ limit: 100, expand: ["data.default_price"] })) {
    if (!product.id.startsWith(PRODUCT_PREFIX)) continue;
    const price =
      product.default_price && typeof product.default_price === "object" ? product.default_price : null;
    products.push({
      id: product.id,
      name: product.name,
      description: product.description ?? null,
      active: product.active,
      url: product.url ?? null,
      images: product.images ?? [],
      eventId: product.metadata?.[META_EVENT] ?? null,
      organizerId: product.metadata?.[META_ORGANIZER] ?? null,
      price: price
        ? { id: price.id, cents: price.unit_amount, currency: price.currency, active: price.active }
        : null,
    });
  }
  return products;
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
    const [tariffs, products, row] = await Promise.all([
      loadCatalogTariffs(organizerId),
      listCatalogProducts(stripeClient(account.secretKey)),
      prisma.organizerStripeAccount.findUnique({
        where: { organizerId },
        select: { accountName: true, catalogSyncedAt: true },
      }),
    ]);
    const steps = planCatalog(tariffs, products, { organizerId });
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
    const [tariffs, products] = await Promise.all([
      loadCatalogTariffs(organizerId, { eventId: options.eventId }),
      listCatalogProducts(stripe),
    ]);
    const steps = planCatalog(tariffs, products, { organizerId, eventId: options.eventId });
    const result: CatalogSyncResult = { created: 0, updated: 0, archived: 0, unchanged: 0, failed: 0 };
    let blocking: CatalogError | null = null;

    await eachLimited(steps, CONCURRENCY, async (step) => {
      if (blocking) return;
      try {
        if (step.kind === "keep") result.unchanged += 1;
        else if (step.kind === "archive") {
          await stripe.products.update(step.product.id, { active: false });
          result.archived += 1;
        } else if (step.kind === "update") {
          await updateProduct(stripe, account, step.tariff, step.product);
          result.updated += 1;
        } else {
          const created = await createProduct(stripe, account, step.tariff);
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

function metadataOf(account: StripeAccount, tariff: CatalogTariff): Stripe.MetadataParam {
  return {
    [META_ORGANIZER]: account.organizerId,
    [META_EVENT]: tariff.eventId,
    [META_SESSION]: tariff.sessionId,
    [META_TICKET_TYPE]: tariff.ticketTypeId,
  };
}

function fieldsOf(tariff: CatalogTariff) {
  return {
    name: tariff.name,
    description: tariff.description,
    ...(tariff.url ? { url: tariff.url } : {}),
    ...(tariff.image ? { images: [tariff.image] } : {}),
  };
}

/** `true` : créé ; `false` : il existait déjà (double clic), mis à jour. */
async function createProduct(
  stripe: Stripe,
  account: StripeAccount,
  tariff: CatalogTariff,
): Promise<boolean> {
  const id = productIdOf(tariff.ticketTypeId);
  try {
    await stripe.products.create({
      id,
      ...fieldsOf(tariff),
      metadata: metadataOf(account, tariff),
      default_price_data: {
        currency: tariff.currency,
        unit_amount: tariff.priceCents,
        // Prix suisses TVA comprise.
        tax_behavior: "inclusive",
      },
    });
    return true;
  } catch (error) {
    if ((error as { code?: string })?.code !== "resource_already_exists") throw error;
    const existing = await stripe.products.retrieve(id, { expand: ["default_price"] });
    const price =
      existing.default_price && typeof existing.default_price === "object" ? existing.default_price : null;
    await updateProduct(stripe, account, tariff, {
      id,
      name: existing.name,
      description: existing.description ?? null,
      active: existing.active,
      url: existing.url ?? null,
      images: existing.images ?? [],
      eventId: existing.metadata?.[META_EVENT] ?? null,
      organizerId: existing.metadata?.[META_ORGANIZER] ?? null,
      price: price
        ? { id: price.id, cents: price.unit_amount, currency: price.currency, active: price.active }
        : null,
    });
    return false;
  }
}

/**
 * Un prix Stripe ne se modifie pas : nouveau prix, mis par défaut, puis
 * l'ancien est archivé (les paiements passés le gardent).
 */
async function updateProduct(
  stripe: Stripe,
  account: StripeAccount,
  tariff: CatalogTariff,
  product: CatalogProduct,
): Promise<void> {
  const old = product.price;
  const priceChanged =
    !old || !old.active || old.cents !== tariff.priceCents || old.currency !== tariff.currency;
  const price = priceChanged
    ? await stripe.prices.create({
        product: product.id,
        currency: tariff.currency,
        unit_amount: tariff.priceCents,
        tax_behavior: "inclusive",
      })
    : null;
  await stripe.products.update(product.id, {
    ...fieldsOf(tariff),
    active: true,
    metadata: metadataOf(account, tariff),
    ...(price ? { default_price: price.id } : {}),
  });
  if (price && old?.active) await stripe.prices.update(old.id, { active: false });
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
