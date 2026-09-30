import "server-only";

import { sendPaidOrderTickets } from "@/lib/email/ticket-mail";
import { markOrderPaid } from "@/lib/orders/mark-paid";
import { prisma } from "@/lib/prisma";
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

