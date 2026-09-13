"use server";

import { resolveCartPayments, type PaymentOffer } from "./payment-methods";

/** Lecture des moyens encore proposés pour les lignes du panier. */
export async function getCartPaymentMethods(
  ticketTypeIds: string[],
): Promise<PaymentOffer> {
  return resolveCartPayments(ticketTypeIds);
}
