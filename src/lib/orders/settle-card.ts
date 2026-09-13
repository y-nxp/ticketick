import "server-only";

import { sendTicketEmail } from "@/lib/email";
import { markOrderPaid } from "@/lib/orders/mark-paid";
import { prisma } from "@/lib/prisma";
import {
  amountToCents,
  fetchPostfinanceTransaction,
  isPaidTransactionState,
  isPostfinanceConfigured,
  orderReferenceFromMerchant,
  type PostfinanceTransaction,
} from "@/lib/payment/postfinance";

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

  const order = await prisma.order.findUnique({
    where: { reference },
    select: {
      email: true,
      firstName: true,
      locale: true,
      items: {
        select: {
          quantity: true,
          ticketType: { select: { name: true } },
        },
      },
    },
  });

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

  if (paid.alreadyPaid || !order) return;

  await sendTicketEmail({
    to: order.email,
    firstName: order.firstName,
    reference,
    locale: order.locale,
    paymentMethod: "CARD",
    totalCents: amountCents,
    currency: (transaction.currency ?? "CHF").toUpperCase(),
    items: order.items.map((item) => ({
      name: readTitle(item.ticketType.name, order.locale) || "Billet",
      quantity: item.quantity,
    })),
  });
}

export async function settlePostfinanceById(transactionId: number): Promise<void> {
  const transaction = await fetchPostfinanceTransaction(transactionId);
  await settlePostfinanceTransaction(transaction);
}

/** Reprend une commande encore en attente quand l'acheteur revient. */
export async function settlePostfinanceOrder(reference: string): Promise<void> {
  if (!isPostfinanceConfigured()) return;

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

  await settlePostfinanceById(id);
}

function readTitle(value: unknown, locale: string): string {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const hit = record[locale] ?? record.fr ?? Object.values(record)[0];
    if (typeof hit === "string") return hit;
  }
  return "";
}
