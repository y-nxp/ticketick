import "server-only";

import { sendRefundAlertEmail } from "@/lib/email";
import { sendPaidOrderTickets } from "@/lib/email/ticket-mail";
import { createCardCheckout, PaymentNotConfiguredError } from "@/lib/payment/card";
import { mockPaymentsAllowed } from "@/lib/payment/config";
import { refundPaypalCapture, paypalAccountFor } from "@/lib/payment/paypal";
import {
  amountToCents,
  fetchPostfinanceTransaction,
  isPaidTransactionState,
  isRefusedRefundState,
  orderReferenceFromMerchant,
  refundPostfinanceTransaction,
} from "@/lib/payment/postfinance";
import { postfinanceAccountForOrder } from "@/lib/payment/postfinance-account";
import { refundStripeSession } from "@/lib/payment/stripe";
import { prisma } from "@/lib/prisma";
import { hashHoldToken } from "./create-order";
import { lockOrder, newPayToken, releaseTickets } from "./edit-order";

/**
 * Règlements ouverts depuis l'admin : lien de paiement par carte, paiement
 * sur place, note de crédit, remboursement chez le prestataire.
 */

// ─────────────────────────────── Encaissement

type SettleOutcome =
  | { kind: "settled"; orderId: string }
  | { kind: "already" }
  | { kind: "late"; reference: string }
  | { kind: "mismatch" }
  | { kind: "unknown" };

/**
 * Solde un paiement attendu : ses billets deviennent valables et le montant
 * entre dans l'encaissé. Idempotent, comme le webhook qui le rejoue.
 */
async function settlePayment(input: {
  chargeId: string;
  provider: string;
  providerRef?: string;
  amountCents?: number;
}): Promise<SettleOutcome> {
  const head = await prisma.orderCharge.findUnique({
    where: { id: input.chargeId },
    select: { orderId: true },
  });
  if (!head) return { kind: "unknown" };

  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, head.orderId);
    const charge = await tx.orderCharge.findUniqueOrThrow({
      where: { id: input.chargeId },
      select: {
        id: true,
        number: true,
        kind: true,
        status: true,
        amountCents: true,
        ticketIds: true,
        orderId: true,
      },
    });
    if (charge.kind !== "PAYMENT") return { kind: "unknown" as const };
    if (charge.status === "DONE") return { kind: "already" as const };
    if (charge.status !== "OPEN") {
      await tx.orderCharge.update({
        where: { id: charge.id },
        data: { provider: input.provider, providerRef: input.providerRef ?? null },
      });
      return { kind: "late" as const, reference: charge.number };
    }
    if (input.amountCents != null && input.amountCents !== charge.amountCents) {
      return { kind: "mismatch" as const };
    }

    await tx.orderCharge.update({
      where: { id: charge.id },
      data: {
        status: "DONE",
        provider: input.provider,
        providerRef: input.providerRef ?? undefined,
        settledAt: new Date(),
      },
    });
    await tx.ticket.updateMany({
      where: { id: { in: charge.ticketIds }, status: "PENDING" },
      data: { status: "VALID" },
    });
    await tx.order.update({
      where: { id: charge.orderId },
      data: { totalCents: { increment: charge.amountCents } },
    });
    return { kind: "settled" as const, orderId: charge.orderId };
  });
}

/** Paiement arrivé par le lien (PostFinance ou simulation). */
async function settleLinkPayment(input: {
  chargeId: string;
  provider: string;
  providerRef?: string;
  amountCents: number;
  currency: string;
}): Promise<void> {
  const outcome = await settlePayment(input);
  if (outcome.kind === "settled") {
    await sendPaidOrderTickets(outcome.orderId);
    return;
  }
  if (outcome.kind === "late") {
    console.error(`[lien] ${outcome.reference} payé après l'échéance : à rembourser`);
    await sendRefundAlertEmail({
      reference: outcome.reference,
      amountCents: input.amountCents,
      currency: input.currency,
      provider: input.provider,
      providerRef: input.providerRef,
    });
    return;
  }
  if (outcome.kind === "mismatch") {
    console.error(`[lien] montant inattendu pour ${input.chargeId}`, {
      amountCents: input.amountCents,
    });
  }
}

/**
 * Règlement constaté à la main : lien ou paiement sur place encaissé en
 * espèces, note de crédit ou remboursement fait hors de ticketick.
 */
export async function settleChargeManually(chargeId: string): Promise<
  { ok: true; orderId: string; sendTickets: boolean } | { ok: false }
> {
  const charge = await prisma.orderCharge.findUnique({
    where: { id: chargeId },
    select: { orderId: true, kind: true, method: true, status: true },
  });
  if (!charge) return { ok: false };

  if (charge.kind === "PAYMENT") {
    if (charge.status !== "OPEN") return { ok: false };
    const outcome = await settlePayment({ chargeId, provider: "cash" });
    if (outcome.kind !== "settled") return { ok: false };
    return { ok: true, orderId: charge.orderId, sendTickets: charge.method === "LINK" };
  }

  const done = await prisma.$transaction(async (tx) => {
    await lockOrder(tx, charge.orderId);
    const claimed = await tx.orderCharge.updateMany({
      where: { id: chargeId, kind: "REFUND", status: { in: ["OPEN", "FAILED"] } },
      data: { status: "DONE", provider: "manual", settledAt: new Date() },
    });
    if (claimed.count === 0) return false;
    const { amountCents } = await tx.orderCharge.findUniqueOrThrow({
      where: { id: chargeId },
      select: { amountCents: true },
    });
    await tx.order.update({
      where: { id: charge.orderId },
      data: { totalCents: { decrement: amountCents } },
    });
    return true;
  });
  return done ? { ok: true, orderId: charge.orderId, sendTickets: false } : { ok: false };
}

// ─────────────────────────────── Échéance et annulation

/**
 * Lien ou paiement sur place abandonné : ses billets sont retirés et les
 * places rendues là d'où elles venaient (vente ou invitations).
 */
async function releaseCharge(chargeId: string, status: "EXPIRED" | "CANCELLED") {
  const head = await prisma.orderCharge.findUnique({
    where: { id: chargeId },
    select: { orderId: true },
  });
  if (!head) return false;

  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, head.orderId);
    const charge = await tx.orderCharge.findUniqueOrThrow({
      where: { id: chargeId },
      select: { status: true, kind: true, ticketIds: true, fromInvites: true },
    });
    if (charge.kind !== "PAYMENT" || charge.status !== "OPEN") return false;

    const active = new Set(
      order.tickets.filter((t) => t.status === "VALID" || t.status === "PENDING").map((t) => t.id),
    );
    const ids = charge.ticketIds.filter((id) => active.has(id));
    if (ids.length > 0) await releaseTickets(tx, order, ids, charge.fromInvites);
    await tx.orderCharge.update({
      where: { id: chargeId },
      data: { status, settledAt: new Date() },
    });

    const left = await tx.ticket.count({
      where: { orderId: order.id, status: { not: "CANCELLED" } },
    });
    if (left === 0) {
      await tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
    }
    return true;
  });
}

export async function cancelCharge(chargeId: string): Promise<boolean> {
  return releaseCharge(chargeId, "CANCELLED");
}

const EXPIRY_BATCH = 50;

/** Balayage : les liens dont l'échéance est passée rendent leurs places. */
export async function expireOverdueCharges(): Promise<number> {
  const due = await prisma.orderCharge.findMany({
    where: { status: "OPEN", method: "LINK", dueAt: { lt: new Date() } },
    select: { id: true },
    take: EXPIRY_BATCH,
  });
  let n = 0;
  for (const charge of due) {
    const done = await releaseCharge(charge.id, "EXPIRED").catch((error) => {
      console.error("[lien] échéance", charge.id, error);
      return false;
    });
    if (done) n += 1;
  }
  return n;
}

/** Nouveau lien (l'ancien ne fonctionne plus), à renvoyer au client. */
export async function rotatePayToken(chargeId: string): Promise<string | null> {
  const { token, tokenHash } = newPayToken();
  const { count } = await prisma.orderCharge.updateMany({
    where: { id: chargeId, method: "LINK", status: "OPEN" },
    data: { tokenHash },
  });
  return count === 1 ? token : null;
}

// ─────────────────────────────── Lien de paiement

export function payPath(token: string, locale: string): string {
  return `${locale === "fr" ? "" : `/${locale}`}/pay/${encodeURIComponent(token)}`;
}

const payChargeSelect = {
  id: true,
  number: true,
  kind: true,
  method: true,
  status: true,
  amountCents: true,
  currency: true,
  dueAt: true,
  provider: true,
  providerRef: true,
  ticketIds: true,
  order: {
    select: {
      id: true,
      reference: true,
      email: true,
      firstName: true,
      lastName: true,
      locale: true,
    },
  },
} as const;

export async function chargeForToken(token: string) {
  if (!token || token.length > 100) return null;
  const charge = await prisma.orderCharge.findUnique({
    where: { tokenHash: hashHoldToken(token) },
    select: payChargeSelect,
  });
  if (!charge || charge.method !== "LINK") return null;
  return charge;
}

export function linkIsPayable(charge: { status: string; dueAt: Date | null }): boolean {
  return charge.status === "OPEN" && (!charge.dueAt || charge.dueAt > new Date());
}

export type StartPayError = "unavailable" | "cardMissing" | "failed";

/**
 * Ouvre le paiement au moment où le client clique : la transaction
 * PostFinance ne commence qu'alors, son délai ne court pas pendant que le
 * courriel attend d'être lu.
 */
export async function startLinkPayment(input: {
  token: string;
  locale: string;
  origin: string;
}): Promise<{ ok: true; url: string } | { ok: false; error: StartPayError }> {
  const charge = await chargeForToken(input.token);
  if (!charge || !linkIsPayable(charge)) return { ok: false, error: "unavailable" };

  const event = await prisma.ticket.findFirst({
    where: { id: { in: charge.ticketIds } },
    select: {
      ticketType: {
        select: {
          session: {
            select: { event: { select: { slug: true, organizer: { select: { name: true } } } } },
          },
        },
      },
    },
  });
  const account = await postfinanceAccountForOrder(charge.order.reference);
  const back = `${input.origin}${payPath(input.token, input.locale)}`;
  try {
    const session = await createCardCheckout(account, {
      reference: charge.number,
      currency: charge.currency,
      customerEmail: charge.order.email,
      firstName: charge.order.firstName,
      lastName: charge.order.lastName,
      locale: input.locale,
      successUrl: `${back}?done=1`,
      cancelUrl: back,
      lineItems: [{ name: charge.number, quantity: 1, unitPriceCents: charge.amountCents }],
      project: event?.ticketType.session.event.slug ?? "ticketick",
      organizerName: event?.ticketType.session.event.organizer.name,
    });
    await prisma.orderCharge.update({
      where: { id: charge.id },
      data: { provider: session.provider, providerRef: session.sessionId },
    });
    // Simulation : retour direct sur la page, sans passer par l'origine publique.
    if (session.mock) {
      return { ok: true, url: `${payPath(input.token, input.locale)}?done=1&mock=1` };
    }
    return { ok: true, url: session.checkoutUrl };
  } catch (error) {
    if (error instanceof PaymentNotConfiguredError) return { ok: false, error: "cardMissing" };
    console.error("[lien] ouverture du paiement", charge.number, error);
    return { ok: false, error: "failed" };
  }
}

/** Retour du client sur la page du lien : constate le paiement sans attendre le webhook. */
export async function confirmLinkReturn(token: string, mock: boolean): Promise<void> {
  const charge = await chargeForToken(token);
  if (!charge || charge.status !== "OPEN" || !charge.providerRef) return;
  if (charge.provider === "mock") {
    if (!mock || !mockPaymentsAllowed()) return;
    await settleLinkPayment({
      chargeId: charge.id,
      provider: "mock",
      providerRef: charge.providerRef,
      amountCents: charge.amountCents,
      currency: charge.currency,
    });
    return;
  }
  if (charge.provider === "postfinance") await settleChargePostfinance(charge.id);
}

/** Webhook PostFinance : la transaction appartient à un lien de paiement. */
export async function settleChargePostfinance(chargeId: string): Promise<void> {
  const charge = await prisma.orderCharge.findUnique({
    where: { id: chargeId },
    select: {
      id: true,
      number: true,
      status: true,
      provider: true,
      providerRef: true,
      order: { select: { reference: true } },
    },
  });
  if (!charge || charge.provider !== "postfinance" || !charge.providerRef) return;
  if (charge.status === "DONE") return;
  const transactionId = Number(charge.providerRef);
  if (!Number.isInteger(transactionId) || transactionId <= 0) return;

  const account = await postfinanceAccountForOrder(charge.order.reference);
  if (!account) {
    console.error("[lien] espace PostFinance introuvable", charge.number);
    return;
  }
  const transaction = await fetchPostfinanceTransaction(account, transactionId);
  const read =
    transaction.metaData?.reference ??
    orderReferenceFromMerchant(transaction.merchantReference);
  if (read !== charge.number) {
    console.error("[lien] transaction d'un autre règlement", { chargeId, transactionId });
    return;
  }
  if (!isPaidTransactionState(transaction.state)) return;
  const amountCents = amountToCents(
    transaction.completedAmount ?? transaction.authorizationAmount,
  );
  if (amountCents == null) return;

  await settleLinkPayment({
    chargeId: charge.id,
    provider: "postfinance",
    providerRef: String(transaction.id),
    amountCents,
    currency: (transaction.currency ?? "CHF").toUpperCase(),
  });
}

export async function chargeForPostfinanceTransaction(
  transactionId: number,
): Promise<string | null> {
  const charge = await prisma.orderCharge.findFirst({
    where: { provider: "postfinance", providerRef: String(transactionId) },
    select: { id: true },
  });
  return charge?.id ?? null;
}

// ─────────────────────────────── Remboursement chez le prestataire

/**
 * Rembourse chez le prestataire du paiement d'origine. Un refus laisse le
 * règlement en échec, à relancer ou à régler en espèces ou par virement.
 */
export async function executeProviderRefund(chargeId: string): Promise<boolean> {
  const charge = await prisma.orderCharge.findUnique({
    where: { id: chargeId },
    select: {
      id: true,
      number: true,
      kind: true,
      method: true,
      status: true,
      amountCents: true,
      currency: true,
      orderId: true,
      order: {
        select: {
          reference: true,
          payment: { select: { provider: true, providerRef: true, status: true } },
          items: {
            take: 1,
            select: {
              ticketType: {
                select: { session: { select: { event: { select: { organizerId: true } } } } },
              },
            },
          },
        },
      },
    },
  });
  if (
    !charge ||
    charge.kind !== "REFUND" ||
    charge.method !== "PROVIDER" ||
    (charge.status !== "OPEN" && charge.status !== "FAILED")
  ) {
    return false;
  }
  const payment = charge.order.payment;
  if (!payment || payment.status !== "COMPLETED" || !payment.providerRef) {
    await markRefund(charge.id, charge.orderId, { ok: false });
    return false;
  }

  try {
    let ref: string | undefined;
    if (payment.provider === "postfinance") {
      const account = await postfinanceAccountForOrder(charge.order.reference);
      if (!account) throw new Error("espace PostFinance introuvable");
      const refund = await refundPostfinanceTransaction(account, {
        transactionId: Number(payment.providerRef),
        amountCents: charge.amountCents,
        externalId: charge.id,
        merchantReference: charge.number,
      });
      if (isRefusedRefundState(refund.state)) throw new Error(`refus ${refund.state}`);
      ref = refund.id != null ? String(refund.id) : undefined;
    } else if (payment.provider === "paypal") {
      const organizerId = charge.order.items[0]?.ticketType.session.event.organizerId;
      const account = organizerId ? await paypalAccountFor([organizerId]) : null;
      if (!account) throw new Error("compte PayPal introuvable");
      const refund = await refundPaypalCapture(account, payment.providerRef, {
        amountCents: charge.amountCents,
        currency: charge.currency,
        requestId: `refund-${charge.id}`,
      });
      if (refund.status !== "COMPLETED" && refund.status !== "PENDING") {
        throw new Error(`refus ${refund.status}`);
      }
      ref = refund.id;
    } else if (payment.provider === "stripe") {
      const refund = await refundStripeSession({
        sessionId: payment.providerRef,
        amountCents: charge.amountCents,
        idempotencyKey: `refund-${charge.id}`,
      });
      if (refund.status === "failed" || refund.status === "canceled") {
        throw new Error(`refus ${refund.status}`);
      }
      ref = refund.id;
    } else if (payment.provider === "mock" && mockPaymentsAllowed()) {
      ref = `mock-refund-${charge.id}`;
    } else {
      throw new Error(`prestataire ${payment.provider} sans remboursement`);
    }
    await markRefund(charge.id, charge.orderId, { ok: true, provider: payment.provider, ref });
    return true;
  } catch (error) {
    console.error("[remboursement]", charge.number, error);
    await markRefund(charge.id, charge.orderId, { ok: false });
    return false;
  }
}

async function markRefund(
  chargeId: string,
  orderId: string,
  result: { ok: true; provider: string; ref?: string } | { ok: false },
) {
  await prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    if (!result.ok) {
      await tx.orderCharge.updateMany({
        where: { id: chargeId, status: { in: ["OPEN", "FAILED"] } },
        data: { status: "FAILED" },
      });
      return;
    }
    const claimed = await tx.orderCharge.updateMany({
      where: { id: chargeId, status: { in: ["OPEN", "FAILED"] } },
      data: {
        status: "DONE",
        provider: result.provider,
        providerRef: result.ref ?? null,
        settledAt: new Date(),
      },
    });
    if (claimed.count === 0) return;
    const { amountCents } = await tx.orderCharge.findUniqueOrThrow({
      where: { id: chargeId },
      select: { amountCents: true },
    });
    await tx.order.update({
      where: { id: orderId },
      data: { totalCents: { decrement: amountCents } },
    });
  });
}
