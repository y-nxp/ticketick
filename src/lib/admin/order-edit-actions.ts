"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { locales } from "@/i18n/routing";
import { catalogActor } from "@/lib/admin/access";
import {
  deliverCharge,
  hasEmail,
  linkPaymentAvailable,
  readPaymentSettle,
} from "@/lib/admin/charge-input";
import {
  failure,
  readBoolean,
  readMoneyCents,
  readText,
  success,
  type FormState,
} from "@/lib/admin/form";
import { payUrlFor, sendCreditNoteEmail, sendPaymentLinkEmail } from "@/lib/email/charge-mail";
import { sendPaidOrderTickets } from "@/lib/email/ticket-mail";
import {
  cancelCharge,
  executeProviderRefund,
  payPath,
  rotatePayToken,
  settleChargeManually,
} from "@/lib/orders/charges";
import {
  addOrderTickets,
  moveOrderSeats,
  removeOrderTickets,
  updateOrderDetails,
  type RefundSettle,
} from "@/lib/orders/edit-order";
import { prisma } from "@/lib/prisma";

/** Commande visible par l'acteur : un organisateur ne touche qu'aux siennes. */
async function ownedOrder(orderId: string) {
  const { user, organizerId } = await catalogActor();
  if (!orderId) return null;
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      ...(organizerId
        ? { items: { some: { ticketType: { session: { event: { organizerId } } } } } }
        : {}),
    },
    select: { id: true, reference: true, email: true, locale: true },
  });
  return order ? { user, order } : null;
}

function refresh(orderId: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
}

// ─────────────────────────────── Coordonnées

const detailsSchema = z.object({
  firstName: z.string().max(80),
  lastName: z.string().max(120),
  email: z.union([z.literal(""), z.email().max(200)]),
  phone: z.string().max(40),
  ticketNote: z.string().max(80),
  locale: z.enum(locales),
});

export async function updateOrderDetailsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const owned = await ownedOrder(readText(formData, "orderId"));
  if (!owned) return failure("notFound");
  const parsed = detailsSchema.safeParse({
    firstName: readText(formData, "firstName"),
    lastName: readText(formData, "lastName"),
    email: readText(formData, "email"),
    phone: readText(formData, "phone"),
    ticketNote: readText(formData, "ticketNote"),
    locale: readText(formData, "locale"),
  });
  if (!parsed.success) return failure("invalid");
  const result = await updateOrderDetails({ orderId: owned.order.id, ...parsed.data });
  if (!result.ok) return failure(result.error);
  refresh(owned.order.id);
  return success("details");
}

// ─────────────────────────────── Places retirées

export async function removeTicketsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const owned = await ownedOrder(readText(formData, "orderId"));
  if (!owned) return failure("notFound");
  const ticketIds = formData
    .getAll("ticket")
    .filter((v): v is string => typeof v === "string" && v.length > 0 && v.length < 40);
  if (ticketIds.length === 0) return failure("empty");

  const method = readText(formData, "refund");
  let refund: RefundSettle = { method: "NONE" };
  if (method === "CASH" || method === "CREDIT_NOTE" || method === "PROVIDER") {
    const amountCents = readMoneyCents(formData, "refundAmount");
    if (amountCents == null) return failure("amount");
    refund = { method, amountCents };
  } else if (method !== "NONE" && method !== "") {
    return failure("invalid");
  }
  if (refund.method === "CREDIT_NOTE" && !hasEmail(owned.order.email)) {
    return failure("emailMissing");
  }

  const result = await removeOrderTickets({
    orderId: owned.order.id,
    ticketIds,
    toInvites: readBoolean(formData, "toInvites"),
    refund,
    actorId: owned.user.id,
  });
  if (!result.ok) return failure(result.error);

  let note: string | undefined;
  if (result.refundChargeId && refund.method === "PROVIDER") {
    note = (await executeProviderRefund(result.refundChargeId)) ? "refunded" : "refundFailed";
  } else if (result.refundChargeId && refund.method === "CREDIT_NOTE") {
    note = (await sendCreditNoteEmail(result.refundChargeId)).sent
      ? "creditNoteSent"
      : "creditNoteNotSent";
  }
  refresh(owned.order.id);
  return success(note ?? "removed");
}

// ─────────────────────────────── Places ajoutées

export async function addTicketsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const owned = await ownedOrder(readText(formData, "orderId"));
  if (!owned) return failure("notFound");

  const sessions = await prisma.orderItem.findMany({
    where: { orderId: owned.order.id },
    select: {
      ticketType: {
        select: {
          session: {
            select: {
              startsAt: true,
              ticketTypes: { select: { id: true, priceCents: true } },
            },
          },
        },
      },
    },
  });
  const types = new Map<string, { priceCents: number; startsAt: Date }>();
  for (const item of sessions) {
    const session = item.ticketType.session;
    for (const tt of session.ticketTypes) {
      types.set(tt.id, { priceCents: tt.priceCents, startsAt: session.startsAt });
    }
  }

  const lines: { ticketTypeId: string; quantity: number }[] = [];
  for (const [id] of types) {
    const raw = readText(formData, `qty.${id}`);
    if (!raw) continue;
    const quantity = Number(raw);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 500) {
      return failure("quantity");
    }
    if (quantity > 0) lines.push({ ticketTypeId: id, quantity });
  }
  if (lines.length === 0) return failure("empty");

  const defaultCents = lines.reduce(
    (sum, l) => sum + types.get(l.ticketTypeId)!.priceCents * l.quantity,
    0,
  );
  const firstStart = lines
    .map((l) => types.get(l.ticketTypeId)!.startsAt)
    .reduce((a, b) => (a < b ? a : b));
  const settle = readPaymentSettle(formData, defaultCents, firstStart);
  if (typeof settle === "string") return failure(settle);
  if (settle.method === "LINK") {
    if (!hasEmail(owned.order.email)) return failure("emailMissing");
    if (!(await linkPaymentAvailable(owned.order.reference))) return failure("cardMissing");
  }

  const result = await addOrderTickets({
    orderId: owned.order.id,
    lines,
    fromInvites: readBoolean(formData, "fromInvites"),
    settle,
    actorId: owned.user.id,
  });
  if (!result.ok) return failure(result.error);

  const note = await deliverCharge({
    orderId: owned.order.id,
    locale: owned.order.locale,
    chargeId: result.chargeId,
    token: result.token,
    sendTickets: readBoolean(formData, "sendTickets"),
    email: owned.order.email,
  });
  refresh(owned.order.id);
  return success(note ?? "added");
}

// ─────────────────────────────── Sièges déplacés

const movesSchema = z
  .array(z.object({ ticketId: z.string().min(1).max(40), to: z.string().min(1).max(40) }))
  .min(1)
  .max(200);

export async function moveSeatsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const owned = await ownedOrder(readText(formData, "orderId"));
  if (!owned) return failure("notFound");
  let raw: unknown;
  try {
    raw = JSON.parse(readText(formData, "moves") || "[]");
  } catch {
    return failure("invalid");
  }
  const moves = movesSchema.safeParse(raw);
  if (!moves.success) return failure("empty");

  const result = await moveOrderSeats({
    orderId: owned.order.id,
    sessionId: readText(formData, "sessionId"),
    moves: moves.data,
    toInvites: readBoolean(formData, "toInvites"),
  });
  if (!result.ok) return failure(result.error);
  refresh(owned.order.id);
  revalidatePath(`/admin/orders/${owned.order.id}/seats`);
  return success("moved");
}

// ─────────────────────────────── Règlements

export async function chargeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const owned = await ownedOrder(readText(formData, "orderId"));
  if (!owned) return failure("notFound");
  const charge = await prisma.orderCharge.findFirst({
    where: { id: readText(formData, "chargeId"), orderId: owned.order.id },
    select: { id: true },
  });
  if (!charge) return failure("notFound");

  let note: string;
  switch (readText(formData, "op")) {
    case "settle": {
      const done = await settleChargeManually(charge.id);
      if (!done.ok) return failure("notEditable");
      note = "settled";
      if (done.sendTickets && hasEmail(owned.order.email)) {
        await sendPaidOrderTickets(owned.order.id);
        note = "settledSent";
      }
      break;
    }
    case "cancel":
      if (!(await cancelCharge(charge.id))) return failure("notEditable");
      note = "chargeCancelled";
      break;
    case "resend": {
      if (!hasEmail(owned.order.email)) return failure("emailMissing");
      const token = await rotatePayToken(charge.id);
      if (!token) return failure("notEditable");
      const sent = await sendPaymentLinkEmail(
        charge.id,
        payUrlFor(payPath(token, owned.order.locale)),
      );
      note = sent.sent ? "linkSent" : "linkNotSent";
      break;
    }
    case "retry":
      note = (await executeProviderRefund(charge.id)) ? "refunded" : "refundFailed";
      break;
    default:
      return failure("invalid");
  }
  refresh(owned.order.id);
  return success(note);
}

export async function resendTicketsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const owned = await ownedOrder(readText(formData, "orderId"));
  if (!owned) return failure("notFound");
  if (!hasEmail(owned.order.email)) return failure("emailMissing");
  const sent = await sendPaidOrderTickets(owned.order.id, { copyOrganizer: false });
  return sent.sent ? success("ticketsSent") : failure("ticketsNotSent");
}
