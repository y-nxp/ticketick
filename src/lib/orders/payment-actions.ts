"use server";

import {
  checkLinesAvailability,
  type AvailabilityLine,
  type AvailabilityResult,
} from "./availability";
import { previewDiscounts, type DiscountPreview } from "./discounts";
import { resolveCartPayments, type PaymentOffer } from "./payment-methods";

/** Lecture des moyens encore proposés pour les lignes du panier. */
export async function getCartPaymentMethods(
  ticketTypeIds: string[],
): Promise<PaymentOffer> {
  return resolveCartPayments(ticketTypeIds);
}

/** Stock réel après libération des rétentions de 25 minutes expirées. */
export async function checkCartAvailability(
  lines: AvailabilityLine[],
): Promise<AvailabilityResult> {
  return checkLinesAvailability(lines.slice(0, 50));
}

/** Rabais automatiques qui s'appliqueraient au panier, pour l'affichage. */
export async function previewCartDiscounts(
  lines: { ticketTypeId: string; quantity: number }[],
  locale: string,
): Promise<DiscountPreview> {
  return previewDiscounts(lines.slice(0, 50), locale);
}
