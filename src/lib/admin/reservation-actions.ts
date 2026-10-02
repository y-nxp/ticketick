"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { locales } from "@/i18n/routing";
import { catalogActor, forbidIfForeignEvent } from "@/lib/admin/access";
import { deliverCharge, hasEmail, readPaymentSettle } from "@/lib/admin/charge-input";
import { failure, readBoolean, readText, success, type FormState } from "@/lib/admin/form";
import { createReservation } from "@/lib/orders/admin-reservation";
import { cancelReservation } from "@/lib/orders/create-order";
import { mockPaymentsAllowed } from "@/lib/payment/config";
import { postfinanceAccountFor } from "@/lib/payment/postfinance-account";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  eventId: z.string().min(1),
  sessionId: z.string().min(1),
  holderName: z.string().max(120),
  ticketNote: z.string().max(80),
  locale: z.enum(locales),
  email: z.union([z.literal(""), z.email().max(200)]),
  phone: z.string().max(40),
});

/** Réserve des places sans paiement ; renvoie l'identifiant de la commande. */
export async function reserveSeats(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user, organizerId } = await catalogActor();
  const parsed = schema.safeParse({
    eventId: readText(formData, "eventId"),
    sessionId: readText(formData, "sessionId"),
    holderName: readText(formData, "holderName"),
    ticketNote: readText(formData, "ticketNote"),
    locale: readText(formData, "locale"),
    email: readText(formData, "email"),
    phone: readText(formData, "phone"),
  });
  if (!parsed.success) return failure("invalid");
  const data = parsed.data;

  await forbidIfForeignEvent(data.eventId, organizerId);
  const session = await prisma.eventSession.findFirst({
    where: { id: data.sessionId, eventId: data.eventId },
    select: {
      id: true,
      startsAt: true,
      event: { select: { organizerId: true } },
      ticketTypes: { select: { id: true, priceCents: true } },
    },
  });
  if (!session) return failure("notFound");

  const lines: { ticketTypeId: string; quantity: number }[] = [];
  for (const tt of session.ticketTypes) {
    const raw = readText(formData, `qty.${tt.id}`);
    if (!raw) continue;
    const quantity = Number(raw);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1000) {
      return failure("quantity");
    }
    if (quantity > 0) lines.push({ ticketTypeId: tt.id, quantity });
  }

  const price = new Map(session.ticketTypes.map((tt) => [tt.id, tt.priceCents]));
  const settle = readPaymentSettle(
    formData,
    lines.reduce((sum, l) => sum + (price.get(l.ticketTypeId) ?? 0) * l.quantity, 0),
    session.startsAt,
  );
  if (typeof settle === "string") return failure(settle);
  if (settle.method === "LINK") {
    if (!hasEmail(data.email)) return failure("emailMissing");
    const card =
      mockPaymentsAllowed() ||
      (await postfinanceAccountFor([session.event.organizerId])) !== null;
    if (!card) return failure("cardMissing");
  }

  const result = await createReservation({
    sessionId: session.id,
    lines,
    holderName: data.holderName,
    ticketNote: data.ticketNote,
    locale: data.locale,
    soldByUserId: user.id,
    fromInvites: readBoolean(formData, "fromInvites"),
    email: data.email,
    phone: data.phone,
    settle,
  });
  if (!result.ok) return failure(result.error);

  await deliverCharge({
    orderId: result.orderId,
    locale: data.locale,
    chargeId: result.chargeId,
    token: result.token,
    sendTickets: readBoolean(formData, "sendTickets"),
    email: data.email,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/events/${data.eventId}`);
  return success(result.orderId);
}

/** Annule une réservation : places remises en vente, billets refusés au contrôle. */
export async function cancelReservationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { organizerId } = await catalogActor();
  const orderId = readText(formData, "orderId");
  if (!orderId) return failure("notFound");

  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      paymentMethod: "RESERVATION",
      ...(organizerId
        ? { items: { some: { ticketType: { session: { event: { organizerId } } } } } }
        : {}),
    },
    select: { id: true },
  });
  if (!order) return failure("notFound");
  if (!(await cancelReservation(order.id))) return failure("notCancellable");

  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${order.id}`);
  return success(order.id);
}
