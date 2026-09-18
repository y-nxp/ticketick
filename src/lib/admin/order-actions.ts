"use server";

import { revalidatePath } from "next/cache";
import { catalogActor } from "@/lib/admin/access";
import { failure, success, type FormState } from "@/lib/admin/form";
import { sendPaidOrderTickets } from "@/lib/email/ticket-mail";
import { isCheckoutHoldEmail } from "@/lib/orders/create-order";
import { markOrderPaid } from "@/lib/orders/mark-paid";
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
