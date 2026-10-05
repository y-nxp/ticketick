import "server-only";

import { sendPaidOrderTickets } from "@/lib/email/ticket-mail";
import {
  chargeForPostfinanceTransaction,
  chargeForStripeSession,
  settleChargePostfinance,
  settleChargeStripe,
} from "@/lib/orders/charges";
import { markOrderPaid } from "@/lib/orders/mark-paid";
import { prisma } from "@/lib/prisma";
import { organizerOfOrder } from "@/lib/payment/card-account";
import { readPaidStripeSession } from "@/lib/payment/stripe";
import { anyStripeAccountForOrganizer, stripeClient } from "@/lib/payment/stripe-account";
import {
  amountToCents,
  fetchPostfinanceTransaction,
  isPaidTransactionState,
  orderReferenceFromMerchant,
  type PostfinanceTransaction,
} from "@/lib/payment/postfinance";
import { postfinanceAccountForOrder } from "@/lib/payment/postfinance-account";

/**
 * Solde une commande carte d'après l'état réel chez PostFinance.
 *
 * Appelé par le webhook et par la page de succès : le retour de l'acheteur
 * confirme aussi le paiement si le webhook n'est pas encore branché.
 */
export async function settlePostfinanceTransaction(
  transaction: PostfinanceTransaction,
): Promise<void> {
  if (!isPaidTransactionState(transaction.state)) return;

  const reference =
    transaction.metaData?.reference ??
    orderReferenceFromMerchant(transaction.merchantReference);
  if (!reference) {
    console.error("[postfinance] transaction sans référence", {
      id: transaction.id,
    });
    return;
  }

  const amountCents = amountToCents(
    transaction.completedAmount ?? transaction.authorizationAmount,
  );
  if (amountCents == null) {
    console.error("[postfinance] montant absent", {
      id: transaction.id,
      reference,
    });
    return;
  }

  const paid = await markOrderPaid({
    reference,
    provider: "postfinance",
    providerRef: String(transaction.id),
    method: "CARD",
    amountCents,
    currency: (transaction.currency ?? "CHF").toUpperCase(),
  });

  if (!paid.ok) {
    console.error(
      `[postfinance] commande ${reference} non soldée : ${paid.error}`,
      { transactionId: transaction.id, amountCents },
    );
    return;
  }

  if (paid.alreadyPaid) return;

  await sendPaidOrderTickets(paid.orderId);
}

/**
 * Webhook : l'identifiant de transaction mène à la commande, et la commande
 * à l'espace de son organisateur, où la transaction est relue. Une
 * transaction inconnue de ticketick est ignorée.
 */
export async function settlePostfinanceById(transactionId: number): Promise<void> {
  const payment = await prisma.payment.findFirst({
    where: { provider: "postfinance", providerRef: String(transactionId) },
    select: { status: true, order: { select: { reference: true } } },
  });
  if (!payment) {
    const chargeId = await chargeForPostfinanceTransaction(transactionId);
    if (chargeId) {
      await settleChargePostfinance(chargeId);
      return;
    }
    console.warn("[postfinance] transaction sans commande", { transactionId });
    return;
  }
  if (payment.status === "COMPLETED") return;
  await settleWithOrderAccount(payment.order.reference, transactionId);
}

/** Reprend une commande encore en attente quand l'acheteur revient. */
export async function settlePostfinanceOrder(reference: string): Promise<void> {
  const payment = await prisma.payment.findFirst({
    where: {
      provider: "postfinance",
      order: { reference },
    },
    select: { providerRef: true, status: true },
  });

  if (!payment?.providerRef || payment.status === "COMPLETED") return;

  const id = Number(payment.providerRef);
  if (!Number.isInteger(id) || id <= 0) return;

  await settleWithOrderAccount(reference, id);
}

async function settleWithOrderAccount(reference: string, transactionId: number) {
  const account = await postfinanceAccountForOrder(reference);
  if (!account) {
    console.error("[postfinance] espace de l'organisateur introuvable", { reference });
    return;
  }
  const transaction = await fetchPostfinanceTransaction(account, transactionId);
  // La transaction relue doit bien être celle de cette commande.
  const read =
    transaction.metaData?.reference ??
    orderReferenceFromMerchant(transaction.merchantReference);
  if (read !== reference) {
    console.error("[postfinance] transaction d'une autre commande", {
      reference,
      transactionId,
    });
    return;
  }
  await settlePostfinanceTransaction(transaction);
}

/**
 * Commande payée par Stripe : la session est relue dans le compte de son
 * organisateur. Appelé par son webhook et par la page de succès.
 */
export async function settleStripeOrder(reference: string): Promise<void> {
  const payment = await prisma.payment.findFirst({
    where: { provider: "stripe", order: { reference } },
    select: { providerRef: true, status: true },
  });
  if (!payment?.providerRef || payment.status === "COMPLETED") return;

  const organizerId = await organizerOfOrder(reference);
  const account = organizerId ? await anyStripeAccountForOrganizer(organizerId) : null;
  if (!account) {
    console.error("[stripe] compte de l'organisateur introuvable", { reference });
    return;
  }
  const session = await readPaidStripeSession(
    stripeClient(account.secretKey),
    payment.providerRef,
  );
  if (!session) return;
  if (session.reference !== reference) {
    console.error("[stripe] session d'une autre commande", { reference });
    return;
  }

  const paid = await markOrderPaid({
    reference,
    provider: "stripe",
    providerRef: session.sessionId,
    method: "CARD",
    amountCents: session.amountCents,
    currency: session.currency,
  });
  if (!paid.ok) {
    console.error(`[stripe] commande ${reference} non soldée : ${paid.error}`, {
      amountCents: session.amountCents,
    });
    return;
  }
  if (paid.alreadyPaid) return;
  await sendPaidOrderTickets(paid.orderId);
}

/** Webhook Stripe : la session appartient à une commande ou à un lien de paiement. */
export async function settleStripeSession(sessionId: string): Promise<void> {
  const payment = await prisma.payment.findFirst({
    where: { provider: "stripe", providerRef: sessionId },
    select: { status: true, order: { select: { reference: true } } },
  });
  if (payment) {
    if (payment.status !== "COMPLETED") await settleStripeOrder(payment.order.reference);
    return;
  }
  const chargeId = await chargeForStripeSession(sessionId);
  if (chargeId) {
    await settleChargeStripe(chargeId);
    return;
  }
  console.warn("[stripe] session sans commande", { sessionId });
}

