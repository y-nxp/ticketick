import "server-only";

import { readInteger, readMoneyCents, readText } from "@/lib/admin/form";
import { payUrlFor, sendPaymentLinkEmail } from "@/lib/email/charge-mail";
import { sendPaidOrderTickets } from "@/lib/email/ticket-mail";
import { payPath } from "@/lib/orders/charges";
import { isCheckoutHoldEmail } from "@/lib/orders/create-order";
import type { PaymentSettle } from "@/lib/orders/edit-order";
import { mockPaymentsAllowed } from "@/lib/payment/config";
import { cardAccountForOrder } from "@/lib/payment/card-account";

/** Courriel qui suit le règlement : lien de paiement, ou billets. */
export async function deliverCharge(input: {
  orderId: string;
  locale: string;
  chargeId?: string;
  token?: string;
  sendTickets: boolean;
  email: string;
}): Promise<string | undefined> {
  if (input.chargeId && input.token) {
    const sent = await sendPaymentLinkEmail(
      input.chargeId,
      payUrlFor(payPath(input.token, input.locale)),
    );
    return sent.sent ? "linkSent" : "linkNotSent";
  }
  if (input.sendTickets && hasEmail(input.email)) {
    const sent = await sendPaidOrderTickets(input.orderId, { copyOrganizer: false });
    return sent.sent ? "ticketsSent" : "ticketsNotSent";
  }
  return undefined;
}

export function hasEmail(email: string): boolean {
  return Boolean(email) && !isCheckoutHoldEmail(email);
}

/** Carte encaissable par lien : l'organisateur a un compte PostFinance ou Stripe actif. */
export async function linkPaymentAvailable(reference: string): Promise<boolean> {
  if (mockPaymentsAllowed()) return true;
  return (await cardAccountForOrder(reference)) !== null;
}

const MAX_DUE_DAYS = 60;

/**
 * Règlement saisi avec les places : montant en francs (vide : prix des
 * tarifs), échéance du lien en jours, bornée au début de la séance.
 */
export function readPaymentSettle(
  formData: FormData,
  defaultCents: number,
  sessionStart: Date | null,
): PaymentSettle | "amount" | "due" {
  const method = readText(formData, "settle");
  if (method === "" || method === "FREE") return { method: "FREE" };
  const typed = readText(formData, "amount");
  const amountCents = typed === "" ? defaultCents : readMoneyCents(formData, "amount");
  if (amountCents == null || amountCents > 100_000_00) return "amount";
  if (method === "CASH" || method === "DOOR") return { method, amountCents };
  if (method !== "LINK") return "amount";
  if (amountCents <= 0) return "amount";
  const days = readInteger(formData, "dueDays") ?? 7;
  if (days < 1 || days > MAX_DUE_DAYS) return "due";
  let dueAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  if (sessionStart && sessionStart < dueAt) dueAt = sessionStart;
  if (dueAt <= new Date()) return "due";
  return { method, amountCents, dueAt };
}
