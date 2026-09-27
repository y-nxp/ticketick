import "server-only";

import { sendPaidOrderTickets } from "@/lib/email/ticket-mail";
import { markOrderPaid } from "@/lib/orders/mark-paid";
import { capturePaypalOrder, paypalAccountFor } from "@/lib/payment/paypal";
import { prisma } from "@/lib/prisma";

export type PaypalSettlement =
  | "paid"
  | "paid_late"
  | "declined"
  | "expired"
  | "unknown";

/**
 * Capture le paiement PayPal d'une commande au retour de l'acheteur.
 *
 * On ne capture que si la commande attend encore son paiement : une rétention
 * déjà libérée n'est pas encaissée, l'acheteur n'est donc jamais débité pour
 * des places reparties.
 */
export async function settlePaypalReturn(
  reference: string,
  paypalOrderId: string,
): Promise<PaypalSettlement> {
  const order = await prisma.order.findUnique({
    where: { reference },
    select: {
      status: true,
      payment: { select: { provider: true, providerRef: true } },
      items: {
        select: {
          ticketType: {
            select: { session: { select: { event: { select: { organizerId: true } } } } },
          },
        },
      },
    },
  });
  if (!order) return "unknown";
  if (order.status === "PAID") return "paid";
  if (
    order.payment?.provider !== "paypal" ||
    order.payment.providerRef !== paypalOrderId
  ) {
    return "unknown";
  }
  if (order.status !== "AWAITING_PAYMENT") return "expired";

  const account = await paypalAccountFor(
    order.items.map((i) => i.ticketType.session.event.organizerId),
  );
  if (!account) {
    console.error("[paypal] compte introuvable au retour de", reference);
    return "unknown";
  }

  const capture = await capturePaypalOrder(account, paypalOrderId);
  if (!capture.completed || capture.amountCents == null) {
    console.warn("[paypal] capture refusée", reference, capture.issue);
    return "declined";
  }

  const paid = await markOrderPaid({
    reference,
    provider: "paypal",
    providerRef: capture.captureId,
    method: "PAYPAL",
    amountCents: capture.amountCents,
    currency: (capture.currency ?? "CHF").toUpperCase(),
  });
  if (!paid.ok) {
    console.error(`[paypal] commande ${reference} non soldée : ${paid.error}`, {
      captureId: capture.captureId,
    });
    return paid.error === "seats_gone" ? "paid_late" : "unknown";
  }
  if (!paid.alreadyPaid) await sendPaidOrderTickets(paid.orderId);
  return "paid";
}
