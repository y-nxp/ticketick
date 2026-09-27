"use server";

import { revalidatePath } from "next/cache";
import { catalogActor } from "@/lib/admin/access";
import { failure, success, type FormState } from "@/lib/admin/form";
import { sendPaidOrderTickets } from "@/lib/email/ticket-mail";
import { isCheckoutHoldEmail, recordOrderRefund } from "@/lib/orders/create-order";
import { markOrderPaid } from "@/lib/orders/mark-paid";
import { paypalAccountFor, refundPaypalCapture } from "@/lib/payment/paypal";
import { prisma } from "@/lib/prisma";

/**
 * Enregistre un paiement cash depuis le backoffice.
 *
 * La commande passe à PAID, les billets PENDING deviennent VALID, et la
 * vente entre dans les statistiques. Pas d'e-mail si les coordonnées n'ont
 * pas encore été saisies (rétention anonyme).
 */
export async function markOrderPaidCash(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { organizerId } = await catalogActor();
  const orderId = String(formData.get("orderId") ?? "").trim();
  if (!orderId) return failure("notFound");

  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      ...(organizerId
        ? {
            items: {
              some: {
                ticketType: { session: { event: { organizerId } } },
              },
            },
          }
        : {}),
    },
    select: {
      id: true,
      reference: true,
      status: true,
      totalCents: true,
      currency: true,
      email: true,
    },
  });

  if (!order) return failure("notFound");
  if (order.status === "PAID") return failure("alreadyPaid");
  if (order.status === "CANCELLED" || order.status === "REFUNDED") {
    return failure("notPayable");
  }

  const paid = await markOrderPaid({
    reference: order.reference,
    provider: "cash",
    method: "CASH",
    amountCents: order.totalCents,
    currency: order.currency,
  });

  if (!paid.ok) {
    return failure(paid.error === "amount_mismatch" ? "amount" : "notFound");
  }

  if (!paid.alreadyPaid && !isCheckoutHoldEmail(order.email)) {
    await sendPaidOrderTickets(paid.orderId);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${order.id}`);
  return success(order.id);
}

/**
 * Rembourse intégralement une commande payée par PayPal, puis remet ses
 * places en vente et annule ses billets.
 */
export async function refundPaypalOrder(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { organizerId } = await catalogActor();
  const orderId = String(formData.get("orderId") ?? "").trim();
  if (!orderId) return failure("notFound");

  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      ...(organizerId
        ? {
            items: {
              some: {
                ticketType: { session: { event: { organizerId } } },
              },
            },
          }
        : {}),
    },
    select: {
      id: true,
      status: true,
      payment: { select: { provider: true, providerRef: true, status: true } },
      items: {
        select: {
          ticketType: {
            select: { session: { select: { event: { select: { organizerId: true } } } } },
          },
        },
      },
    },
  });

  if (!order) return failure("notFound");
  if (
    order.status !== "PAID" ||
    order.payment?.provider !== "paypal" ||
    order.payment.status !== "COMPLETED" ||
    !order.payment.providerRef
  ) {
    return failure("notRefundable");
  }

  const account = await paypalAccountFor(
    order.items.map((i) => i.ticketType.session.event.organizerId),
  );
  if (!account) return failure("paypalMissing");

  try {
    const refund = await refundPaypalCapture(account, order.payment.providerRef);
    if (refund.status !== "COMPLETED" && refund.status !== "PENDING") {
      return failure("refundFailed");
    }
  } catch (error) {
    console.error("[paypal] remboursement", order.id, error);
    return failure("refundFailed");
  }

  await recordOrderRefund(order.id);

  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${order.id}`);
  return success(order.id);
}
