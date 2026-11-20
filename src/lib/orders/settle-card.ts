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
  PostfinanceError,
  type PostfinanceTransaction,
} from "@/lib/payment/postfinance";
import {
  postfinanceAccountForOrder,
  postfinanceAccountsForSpace,
} from "@/lib/payment/postfinance-account";

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

  // Autorisée mais pas encore débitée : PostFinance donne alors un montant
  // débité à 0, le montant à retenir est celui de l'autorisation.
  const amountCents = amountToCents(
    transaction.completedAmount || transaction.authorizationAmount,
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
 * à l'espace de son organisateur, où la transaction est relue. La
 * transaction d'une tentative précédente (paiement relancé) compte aussi.
 * Une transaction inconnue est relue dans l'espace qui l'envoie et retrouvée
 * par la référence de commande qu'elle porte.
 */
export async function settlePostfinanceById(
  transactionId: number,
  spaceId?: number,
): Promise<void> {
  const ref = String(transactionId);
  const payment = await prisma.payment.findFirst({
    where: {
      provider: "postfinance",
      OR: [{ providerRef: ref }, { previousRefs: { has: ref } }],
    },
    select: { status: true, providerRef: true, order: { select: { reference: true } } },
  });
  if (!payment) {
    const chargeId = await chargeForPostfinanceTransaction(transactionId);
    if (chargeId) {
      await settleChargePostfinance(chargeId);
      return;
    }
    await settleUnknownTransaction(transactionId, spaceId);
    return;
  }
  if (payment.status === "COMPLETED" && payment.providerRef === ref) return;
  await settleWithOrderAccount(payment.order.reference, transactionId);
}

/**
 * Reprend une commande encore en attente quand l'acheteur revient : la
 * dernière transaction d'abord, puis celles des tentatives précédentes.
 */
export async function settlePostfinanceOrder(reference: string): Promise<void> {
  const payment = await prisma.payment.findFirst({
    where: {
      provider: "postfinance",
      order: { reference },
    },
    select: { providerRef: true, previousRefs: true, status: true },
  });

  if (!payment?.providerRef || payment.status === "COMPLETED") return;

  const ids = [payment.providerRef, ...[...payment.previousRefs].reverse()]
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);

  for (const id of new Set(ids)) {
    if (await settleWithOrderAccount(reference, id)) return;
  }
}

/** Relit la transaction dans l'espace de la commande ; `true` si elle est payée. */
async function settleWithOrderAccount(
  reference: string,
  transactionId: number,
): Promise<boolean> {
  const account = await postfinanceAccountForOrder(reference);
  if (!account) {
    console.error("[postfinance] espace de l'organisateur introuvable", { reference });
    return false;
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
    return false;
  }
  if (!isPaidTransactionState(transaction.state)) return false;
  await settlePostfinanceTransaction(transaction);
  return true;
}

/**
 * Transaction que ticketick ne connaît pas (créée avant que l'on garde les
 * tentatives précédentes) : relue dans l'espace qui l'envoie, elle doit
 * porter la référence d'une commande de l'organisateur de cet espace.
 */
async function settleUnknownTransaction(transactionId: number, spaceId?: number) {
  const accounts = await postfinanceAccountsForSpace(spaceId);
  for (const account of accounts) {
    let transaction: PostfinanceTransaction;
    try {
      transaction = await fetchPostfinanceTransaction(account, transactionId);
    } catch (error) {
      // Transaction d'un autre espace : on passe au suivant.
      if (error instanceof PostfinanceError && (error.status === 404 || error.status === 403)) {
        continue;
      }
      throw error;
    }
    const reference =
      transaction.metaData?.reference ??
      orderReferenceFromMerchant(transaction.merchantReference);
    const owner = reference ? await postfinanceAccountForOrder(reference) : null;
    if (!reference || owner?.organizerId !== account.organizerId) {
      console.warn("[postfinance] transaction sans commande", { transactionId, reference });
      return;
    }
    console.warn("[postfinance] transaction retrouvée par sa référence", {
      transactionId,
      reference,
      state: transaction.state,
    });
    await settlePostfinanceTransaction(transaction);
    return;
  }
  console.warn("[postfinance] transaction sans commande", { transactionId });
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

