import "server-only";

import { Prisma } from "@prisma/client";
import { jwtVerify, SignJWT } from "jose";
import type Stripe from "stripe";
import type { CurrentUser } from "@/lib/auth/dal";
import { publicAppOrigin } from "@/lib/app-url";
import { anyStripeAccountForOrganizer, stripeAccountForOrganizer, stripeClient } from "@/lib/payment/stripe-account";
import { prisma } from "@/lib/prisma";
import { t as translate, type Translated } from "@/lib/types";
import { EVENT_TIME_ZONE } from "@/lib/utils";
import { collectLaunchUrl, saleDescription, type CollectReturn } from "./collect-link";
import { doorEventWhere } from "./scope";

export { currentSaleSession } from "./current-sale";

/**
 * Caisse sur place : on vend les billets papier réservés en amont (lots de
 * réservations). La personne à l'entrée choisit le concert et les tarifs,
 * Collect for Stripe encaisse sur le lecteur, puis renvoie vers ticketick
 * qui vérifie le paiement chez Stripe et compte la vente.
 *
 * Aucun billet ticketick n'est émis ni aucune place prise : les places sont
 * déjà retenues par les lots. La vente est comptée par tarif, pour savoir ce
 * qu'il reste de papier, et s'ajoute à la caisse du soir du rapport SUISA.
 *
 * Entre les deux, la vente voyage dans un jeton signé placé dans l'adresse de
 * retour : le navigateur ouvert par Collect n'est pas forcément celui où l'on
 * était connecté (app installée sur l'écran d'accueil de l'iPhone). Le
 * paiement vérifié chez Stripe, et jamais compté deux fois, fait foi.
 */

/** Vente encore possible jusqu'à trois heures après le début (retardataires). */
export const LATE_SALE_MS = 3 * 60 * 60 * 1000;
const TOKEN_TTL = "3h";
const AUDIENCE = "door-sale";
const MAX_PER_LINE = 50;
/** Un paiement plus ancien que la vente préparée ne peut pas lui appartenir. */
const CHARGE_MAX_AGE_MS = 4 * 60 * 60 * 1000;

export interface SaleTariff {
  id: string;
  name: string;
  priceCents: number;
  currency: string;
  /** Billets de ce tarif déjà vendus à la caisse pour ce concert. */
  soldAtTill: number;
}

export interface SaleSession {
  id: string;
  title: string;
  startsAt: Date;
  venue: string | null;
  organizerId: string;
  organizerName: string;
  tariffs: SaleTariff[];
}

const sessionSelect = {
  id: true,
  startsAt: true,
  label: true,
  venue: { select: { name: true } },
  event: { select: { title: true, organizerId: true, organizer: { select: { name: true } } } },
  ticketTypes: {
    orderBy: [{ priceCents: "desc" as const }, { id: "asc" as const }],
    select: { id: true, name: true, priceCents: true, currency: true },
  },
} satisfies Prisma.EventSessionSelect;

/**
 * Concerts de la caisse : ceux des organisateurs qui encaissent avec Stripe
 * (sans compte Stripe, le paiement ne peut pas être vérifié).
 */
function sellableWhere(user: CurrentUser, now: Date): Prisma.EventSessionWhereInput {
  return {
    startsAt: { gte: new Date(now.getTime() - LATE_SALE_MS) },
    status: { in: ["PUBLISHED", "SOLD_OUT"] },
    event: {
      ...doorEventWhere(user),
      status: { in: ["PUBLISHED", "SOLD_OUT"] },
      organizer: { stripe: { enabled: true } },
    },
  };
}

type SessionRow = Prisma.EventSessionGetPayload<{ select: typeof sessionSelect }>;

function toSaleSession(s: SessionRow, locale: string, sold: Map<string, number> = new Map()): SaleSession {
  const title = translate(s.event.title as Translated, locale);
  const label = s.label ? translate(s.label as Translated, locale) : null;
  return {
    id: s.id,
    title: label ? `${title} (${label})` : title,
    startsAt: s.startsAt,
    venue: s.venue?.name ?? null,
    organizerId: s.event.organizerId,
    organizerName: s.event.organizer.name,
    tariffs: s.ticketTypes.map((tt) => ({
      id: tt.id,
      name: translate(tt.name as Translated, locale),
      priceCents: tt.priceCents,
      currency: tt.currency,
      soldAtTill: sold.get(tt.id) ?? 0,
    })),
  };
}

/** Concerts en vente à la caisse, dans l'ordre des dates. */
export async function getSaleSessions(user: CurrentUser, locale: string): Promise<SaleSession[]> {
  const rows = await prisma.eventSession.findMany({
    where: sellableWhere(user, new Date()),
    orderBy: { startsAt: "asc" },
    take: 80,
    select: sessionSelect,
  });
  return rows.map((row) => toSaleSession(row, locale));
}

export async function getSaleSession(
  user: CurrentUser,
  sessionId: string,
  locale: string,
): Promise<SaleSession | null> {
  const row = await prisma.eventSession.findFirst({
    where: { id: sessionId, ...sellableWhere(user, new Date()) },
    select: sessionSelect,
  });
  return row ? toSaleSession(row, locale, await soldAtTill(row.id)) : null;
}

/** La caisse existe-t-elle pour ce compte (un organisateur avec Stripe) ? */
export async function doorTillEnabled(user: CurrentUser): Promise<boolean> {
  if (user.role === "ADMIN") {
    return (await prisma.organizerStripeAccount.count({ where: { enabled: true } })) > 0;
  }
  const organizerId =
    user.role === "DOOR_STAFF" ? user.doorOrganizerId : user.role === "ORGANIZER" ? user.organizerId : null;
  if (!organizerId) return false;
  return (await prisma.organizerStripeAccount.count({ where: { organizerId, enabled: true } })) > 0;
}

/** Billets vendus à la caisse pour un concert, par tarif. */
async function soldAtTill(sessionId: string): Promise<Map<string, number>> {
  const sales = await prisma.doorSale.findMany({ where: { sessionId }, select: { lines: true } });
  const sold = new Map<string, number>();
  for (const sale of sales) {
    for (const line of readLines(sale.lines)) {
      sold.set(line.ticketTypeId, (sold.get(line.ticketTypeId) ?? 0) + line.quantity);
    }
  }
  return sold;
}

export interface SaleLine {
  ticketTypeId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
}

export function readLines(value: Prisma.JsonValue): SaleLine[] {
  return Array.isArray(value) ? (value as unknown as SaleLine[]) : [];
}

// ───────────────────────────── Jeton de la vente

interface SaleClaim {
  /** Vendeur. */
  u: string;
  /** Séance. */
  s: string;
  /** Lignes : [tarif, quantité]. */
  l: [string, number][];
  /** Montant attendu, en centimes. */
  a: number;
  /** Monnaie, en minuscules. */
  c: string;
  locale: string;
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET absent");
  return new TextEncoder().encode(secret);
}

async function signSale(claim: SaleClaim): Promise<string> {
  return new SignJWT({ ...claim })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secretKey());
}

async function readSale(token: string): Promise<SaleClaim | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"], audience: AUDIENCE });
    const claim = payload as unknown as SaleClaim;
    return typeof claim.u === "string" && typeof claim.s === "string" && Array.isArray(claim.l) ? claim : null;
  } catch {
    return null;
  }
}

// ───────────────────────────── Préparer la vente

export type SaleError =
  | "empty"
  | "notFound"
  | "quantity"
  | "noStripe"
  | "expired"
  | "notPaid"
  | "amountMismatch"
  | "stripe";

export type PrepareResult =
  | { ok: true; kind: "collect"; url: string }
  | { ok: true; kind: "done"; saleId: string }
  | { ok: false; error: SaleError; ticketTypeId?: string };

export async function prepareDoorSale(
  user: CurrentUser,
  input: { sessionId: string; lines: { ticketTypeId: string; quantity: number }[]; locale: string },
): Promise<PrepareResult> {
  const session = await getSaleSession(user, input.sessionId, input.locale);
  if (!session) return { ok: false, error: "notFound" };
  const lines = input.lines.filter((l) => l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: "empty" };
  const tariffs = new Map(session.tariffs.map((tt) => [tt.id, tt]));
  for (const line of lines) {
    if (!tariffs.has(line.ticketTypeId) || !Number.isInteger(line.quantity) || line.quantity > MAX_PER_LINE) {
      return { ok: false, error: "quantity", ticketTypeId: line.ticketTypeId };
    }
  }
  const amountCents = lines.reduce((sum, l) => sum + tariffs.get(l.ticketTypeId)!.priceCents * l.quantity, 0);

  if (amountCents === 0) {
    const sale = await recordSale(session, user.id, lines, { provider: "free", chargeId: null, amountCents: 0 });
    return { ok: true, kind: "done", saleId: sale.id };
  }

  // Le paiement sera vérifié dans le compte Stripe de l'organisateur.
  if (!(await stripeAccountForOrganizer(session.organizerId))) return { ok: false, error: "noStripe" };

  const currency = tariffs.get(lines[0]!.ticketTypeId)!.currency.toLowerCase();
  const token = await signSale({
    u: user.id,
    s: session.id,
    l: lines.map((l) => [l.ticketTypeId, l.quantity]),
    a: amountCents,
    c: currency,
    locale: input.locale,
  });
  const prefix = input.locale === "fr" ? "" : `/${input.locale}`;
  const when = new Intl.DateTimeFormat("fr-CH", {
    timeZone: EVENT_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(session.startsAt);
  return {
    ok: true,
    kind: "collect",
    url: collectLaunchUrl({
      amountCents,
      description: saleDescription({
        organizer: session.organizerName,
        when,
        title: session.title,
        lines: lines.map((l) => ({ quantity: l.quantity, tariff: tariffs.get(l.ticketTypeId)!.name })),
      }),
      // Les points du jeton feraient prendre l'adresse pour un fichier (404).
      callback: `${publicAppOrigin()}${prefix}/door/sell/done/${token.replaceAll(".", "~")}`,
    }),
  };
}

async function recordSale(
  session: SaleSession,
  userId: string,
  lines: { ticketTypeId: string; quantity: number }[],
  payment: { provider: "collect" | "free"; chargeId: string | null; amountCents: number },
): Promise<{ id: string }> {
  const tariffs = new Map(session.tariffs.map((tt) => [tt.id, tt]));
  const saleLines: SaleLine[] = lines.map((l) => ({
    ticketTypeId: l.ticketTypeId,
    name: tariffs.get(l.ticketTypeId)?.name ?? "",
    quantity: l.quantity,
    unitPriceCents: tariffs.get(l.ticketTypeId)?.priceCents ?? 0,
  }));
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  return prisma.doorSale.create({
    data: {
      sessionId: session.id,
      chargeId: payment.chargeId,
      provider: payment.provider,
      amountCents: payment.amountCents,
      currency: (session.tariffs[0]?.currency ?? "CHF").toUpperCase(),
      paidTickets: saleLines.filter((l) => l.unitPriceCents > 0).reduce((n, l) => n + l.quantity, 0),
      lines: saleLines as unknown as Prisma.InputJsonValue,
      soldById: user?.id ?? null,
    },
    select: { id: true },
  });
}

// ───────────────────────────── Retour de Collect

export type CompleteResult =
  | { status: "done"; saleId: string; again: boolean }
  | { status: "cancelled" }
  | { status: "refunded"; error: SaleError }
  | { status: "error"; error: SaleError };

export async function completeDoorSale(token: string, ret: CollectReturn): Promise<CompleteResult> {
  const claim = await readSale(decodeURIComponent(token).replaceAll("~", "."));
  if (!claim) return { status: "error", error: "expired" };
  if (ret.result !== "success") return { status: "cancelled" };

  const already = await prisma.doorSale.findUnique({ where: { chargeId: ret.chargeId }, select: { id: true } });
  if (already) return { status: "done", saleId: already.id, again: true };

  const row = await prisma.eventSession.findUnique({ where: { id: claim.s }, select: sessionSelect });
  if (!row) return { status: "error", error: "notFound" };
  const session = toSaleSession(row, claim.locale);

  const account = await anyStripeAccountForOrganizer(session.organizerId);
  if (!account) return { status: "error", error: "noStripe" };
  const stripe = stripeClient(account.secretKey);
  let charge: Stripe.Charge;
  try {
    charge = await retrieveCharge(stripe, ret.chargeId);
  } catch {
    return { status: "error", error: "stripe" };
  }
  const paid = charge.status === "succeeded" && charge.paid && !charge.refunded;
  const fresh = Date.now() - charge.created * 1000 < CHARGE_MAX_AGE_MS;
  if (!paid || !fresh) return { status: "error", error: "notPaid" };
  if (charge.amount !== claim.a || charge.currency !== claim.c) {
    await refund(stripe, charge);
    return { status: "refunded", error: "amountMismatch" };
  }

  try {
    const sale = await recordSale(
      session,
      claim.u,
      claim.l.map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity })),
      { provider: "collect", chargeId: charge.id, amountCents: claim.a },
    );
    return { status: "done", saleId: sale.id, again: false };
  } catch (error) {
    // Retour ouvert deux fois en même temps : la première vente compte.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const sale = await prisma.doorSale.findUnique({ where: { chargeId: charge.id }, select: { id: true } });
      if (sale) return { status: "done", saleId: sale.id, again: true };
    }
    throw error;
  }
}

async function retrieveCharge(stripe: Stripe, id: string): Promise<Stripe.Charge> {
  if (id.startsWith("pi_")) {
    const intent = await stripe.paymentIntents.retrieve(id, { expand: ["latest_charge"] });
    const latest = intent.latest_charge;
    if (!latest || typeof latest === "string") throw new Error("paiement sans charge");
    return latest;
  }
  return stripe.charges.retrieve(id);
}

async function refund(stripe: Stripe, charge: Stripe.Charge): Promise<void> {
  await stripe.refunds.create({ charge: charge.id }, { idempotencyKey: `door-sale-refund-${charge.id}` });
}

/** Ce que la page de retour affiche : la vente, et le total de la caisse pour ce concert. */
export async function getDoorSaleSummary(saleId: string, locale: string) {
  const sale = await prisma.doorSale.findUnique({
    where: { id: saleId },
    select: { id: true, amountCents: true, currency: true, lines: true, sessionId: true, session: { select: sessionSelect } },
  });
  if (!sale) return null;
  const session = toSaleSession(sale.session, locale, await soldAtTill(sale.sessionId));
  return { sale: { ...sale, lines: readLines(sale.lines) }, session };
}
