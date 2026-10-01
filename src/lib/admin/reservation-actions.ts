"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { locales } from "@/i18n/routing";
import { catalogActor, forbidIfForeignEvent } from "@/lib/admin/access";
import { failure, readText, success, type FormState } from "@/lib/admin/form";
import { createReservation } from "@/lib/orders/admin-reservation";
import { cancelReservation } from "@/lib/orders/create-order";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  eventId: z.string().min(1),
  sessionId: z.string().min(1),
  holderName: z.string().max(120),
  ticketNote: z.string().max(80),
  locale: z.enum(locales),
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
  });
  if (!parsed.success) return failure("invalid");
  const data = parsed.data;

  await forbidIfForeignEvent(data.eventId, organizerId);
  const session = await prisma.eventSession.findFirst({
    where: { id: data.sessionId, eventId: data.eventId },
    select: { id: true, ticketTypes: { select: { id: true } } },
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

  const result = await createReservation({
    sessionId: session.id,
    lines,
    holderName: data.holderName,
    ticketNote: data.ticketNote,
    locale: data.locale,
    soldByUserId: user.id,
  });
  if (!result.ok) return failure(result.error);

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
