import "server-only";

import type { Prisma } from "@prisma/client";
import { jwtVerify, SignJWT } from "jose";
import type Stripe from "stripe";
import type { CurrentUser } from "@/lib/auth/dal";
import { publicAppOrigin } from "@/lib/app-url";
import { createReservation, type ReservationError } from "@/lib/orders/admin-reservation";
import { anyStripeAccountForOrganizer, stripeAccountForOrganizer, stripeClient } from "@/lib/payment/stripe-account";
import { prisma } from "@/lib/prisma";
import { readLayout, zoneAllowed } from "@/lib/seating/layout";
import { syncSessionSeats } from "@/lib/seating/seats";
import { t as translate, type Translated } from "@/lib/types";
import { EVENT_TIME_ZONE } from "@/lib/utils";
import { collectLaunchUrl, saleDescription, type CollectReturn } from "./collect-link";
import { isEntryOpen } from "./entry-window";

export { currentSaleSession } from "./current-sale";
import { doorEventWhere } from "./scope";

/**
 * Caisse du soir : la personne à l'entrée choisit le concert et les tarifs
 * dans ticketick, Collect for Stripe encaisse sur le lecteur, puis renvoie
 * vers ticketick qui vérifie le paiement chez Stripe et enregistre la vente
 * (contingent, rapports, SUISA).
 *
 * Entre les deux, la vente voyage dans un jeton signé placé dans l'adresse de
 * retour : au retour de Collect, le navigateur n'est pas forcément celui où
 * l'on était connecté (app installée sur l'écran d'accueil de l'iPhone).
 * Le paiement vérifié chez Stripe, et jamais utilisé deux fois, fait foi.
 */

/** Vente encore possible jusqu'à trois heures après le début (retardataires). */
export const LATE_SALE_MS = 3 * 60 * 60 * 1000;
const TOKEN_TTL = "3h";
const AUDIENCE = "door-sale";
const MAX_PER_LINE = 30;
/** Un paiement plus ancien que la vente préparée ne peut pas lui appartenir. */
const CHARGE_MAX_AGE_MS = 4 * 60 * 60 * 1000;

export interface SaleTariff {
  id: string;
  name: string;
  priceCents: number;
  currency: string;
  /** Places encore disponibles pour ce tarif. */
  left: number;
}

export interface SaleSession {
  id: string;
  title: string;
  startsAt: Date;
  venue: string | null;
  organizerId: string;
  organizerName: string;
  seated: boolean;
  tariffs: SaleTariff[];
}

const sessionSelect = {
  id: true,
  startsAt: true,
  label: true,
  capacity: true,
  sold: true,
  seatPlanId: true,
  venue: { select: { name: true } },
  event: { select: { title: true, organizerId: true, organizer: { select: { name: true } } } },
  ticketTypes: {
    orderBy: [{ priceCents: "desc" as const }, { id: "asc" as const }],
    select: { id: true, name: true, priceCents: true, currency: true, quantity: true, sold: true },
  },
} satisfies Prisma.EventSessionSelect;

function sellableWhere(user: CurrentUser, now: Date) {
  return {
    startsAt: { gte: new Date(now.getTime() - LATE_SALE_MS) },
    status: { in: ["PUBLISHED" as const, "SOLD_OUT" as const] },
    event: {
      ...doorEventWhere(user),
      status: { in: ["PUBLISHED" as const, "SOLD_OUT" as const] },
      // Caisse activée par l'organisateur (Collect for Stripe, WisePad).
      organizer: { doorTill: "collect" },
    },
  };
}

type SessionRow = {
  id: string;
  startsAt: Date;
  label: unknown;
  capacity: number | null;
  sold: number;
  seatPlanId: string | null;
  venue: { name: string } | null;
  event: { title: unknown; organizerId: string; organizer: { name: string } };
  ticketTypes: { id: string; name: unknown; priceCents: number; currency: string; quantity: number; sold: number }[];
};

function toSaleSession(s: SessionRow, locale: string): SaleSession {
  const title = translate(s.event.title as Translated, locale);
  const label = s.label ? translate(s.label as Translated, locale) : null;
  const room = s.capacity != null ? Math.max(0, s.capacity - s.sold) : Infinity;
  return {
    id: s.id,
    title: label ? `${title} (${label})` : title,
    startsAt: s.startsAt,
    venue: s.venue?.name ?? null,
    organizerId: s.event.organizerId,
    organizerName: s.event.organizer.name,
    seated: s.seatPlanId != null,
    tariffs: s.ticketTypes.map((tt) => ({
      id: tt.id,
      name: translate(tt.name as Translated, locale),
      priceCents: tt.priceCents,
      currency: tt.currency,
      left: Math.max(0, Math.min(tt.quantity - tt.sold, room)),
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
    select: { ...sessionSelect, seatPlan: { select: { layout: true } } },
  });
  if (!row) return null;
  const session = toSaleSession(row, locale);
  const layout = readLayout(row.seatPlan?.layout);
  if (!layout) return session;

  // Placement numéroté : seuls les sièges libres de la zone du tarif se vendent
  // (les places invités, bloquées, restent à l'admin).
  await syncSessionSeats(session.id);
  const free = new Set(
    (
      await prisma.sessionSeat.findMany({
        where: { sessionId: session.id, status: "AVAILABLE" },
        select: { seatKey: true },
      })
    ).map((seat) => seat.seatKey),
  );
  const zones = new Map(
    (
      await prisma.ticketType.findMany({
        where: { sessionId: session.id },
        select: { id: true, seatZones: true },
      })
    ).map((tt) => [tt.id, tt.seatZones]),
  );
  return {
    ...session,
    tariffs: session.tariffs.map((tt) => {
      const seats = layout.seats.filter(
        (seat) => free.has(seat.key) && zoneAllowed(zones.get(tt.id) ?? [], seat.zone),
      ).length;
      return { ...tt, left: Math.min(tt.left, seats) };
    }),
  };
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
  | ReservationError
  | "quantity"
  | "noStripe"
  | "expired"
  | "notPaid"
  | "amountMismatch"
  | "stripe";

export type PrepareResult =
  | { ok: true; kind: "collect"; url: string }
  | { ok: true; kind: "done"; orderId: string }
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
    const tt = tariffs.get(line.ticketTypeId);
    if (!tt || !Number.isInteger(line.quantity) || line.quantity > MAX_PER_LINE) {
      return { ok: false, error: "quantity", ticketTypeId: line.ticketTypeId };
    }
    if (line.quantity > tt.left) return { ok: false, error: "soldOut", ticketTypeId: tt.id };
  }
  const amountCents = lines.reduce((sum, l) => sum + tariffs.get(l.ticketTypeId)!.priceCents * l.quantity, 0);

  if (amountCents === 0) {
    const result = await record(session, user.id, lines, input.locale, { method: "FREE" });
    return result.ok ? { ok: true, kind: "done", orderId: result.orderId } : result;
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

async function record(
  session: SaleSession,
  userId: string,
  lines: { ticketTypeId: string; quantity: number }[],
  locale: string,
  settle: { method: "FREE" } | { method: "TERMINAL"; amountCents: number; provider: string; providerRef: string },
) {
  const result = await createReservation({
    parts: [{ sessionId: session.id, lines }],
    holderName: "",
    ticketNote: "",
    locale,
    soldByUserId: userId,
    settle,
    lateSaleMs: LATE_SALE_MS,
  });
  if (!result.ok) return result;
  // Vendu à l'entrée, déjà ouverte : la personne entre tout de suite.
  if (isEntryOpen(session.startsAt.toISOString())) {
    await prisma.ticket.updateMany({
      where: { orderId: result.orderId, status: "VALID" },
      data: { status: "USED", usedAt: new Date() },
    });
  }
  return result;
}

// ───────────────────────────── Retour de Collect

export type CompleteResult =
  | { status: "done"; orderId: string; again: boolean }
  | { status: "cancelled" }
  | { status: "refunded"; error: SaleError }
  | { status: "error"; error: SaleError };

const inFlight = new Set<string>();

export async function completeDoorSale(token: string, ret: CollectReturn): Promise<CompleteResult> {
  const claim = await readSale(decodeURIComponent(token).replaceAll("~", "."));
  if (!claim) return { status: "error", error: "expired" };
  if (ret.result !== "success") return { status: "cancelled" };

  const chargeId = ret.chargeId;
  const already = await recordedOrder(chargeId);
  if (already) return { status: "done", orderId: already, again: true };
  // Retour ouvert deux fois de suite : une seule vente.
  if (inFlight.has(chargeId)) return { status: "error", error: "retry" };
  inFlight.add(chargeId);
  try {
    const row = await prisma.eventSession.findUnique({ where: { id: claim.s }, select: sessionSelect });
    const user = await prisma.user.findUnique({ where: { id: claim.u }, select: { id: true, active: true } });
    if (!row || !user?.active) return { status: "error", error: "notFound" };
    const session = toSaleSession(row, claim.locale);

    const account = await anyStripeAccountForOrganizer(session.organizerId);
    if (!account) return { status: "error", error: "noStripe" };
    const stripe = stripeClient(account.secretKey);
    let charge: Stripe.Charge;
    try {
      charge = await retrieveCharge(stripe, chargeId);
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

    const result = await record(
      session,
      user.id,
      claim.l.map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity })),
      claim.locale,
      { method: "TERMINAL", amountCents: claim.a, provider: "collect", providerRef: charge.id },
    );
    if (!result.ok) {
      // Plus de place entre-temps : l'argent repart tout de suite.
      await refund(stripe, charge);
      return { status: "refunded", error: result.error };
    }
    return { status: "done", orderId: result.orderId, again: false };
  } finally {
    inFlight.delete(chargeId);
  }
}

async function recordedOrder(chargeId: string): Promise<string | null> {
  const charge = await prisma.orderCharge.findFirst({
    where: { provider: "collect", providerRef: chargeId },
    select: { orderId: true },
  });
  return charge?.orderId ?? null;
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

/** Ce que la page de retour affiche : billets émis, sièges. */
export async function getDoorSaleSummary(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    select: {
      reference: true,
      totalCents: true,
      currency: true,
      tickets: {
        orderBy: { seatLabel: "asc" },
        select: {
          status: true,
          seatLabel: true,
          ticketType: {
            select: {
              name: true,
              session: { select: { id: true, startsAt: true, event: { select: { title: true } } } },
            },
          },
        },
      },
    },
  });
}
