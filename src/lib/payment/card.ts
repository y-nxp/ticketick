import "server-only";

import {
  mockPaymentsAllowed,
  PaymentNotConfiguredError,
} from "@/lib/payment/config";
import type { CardAccount } from "@/lib/payment/card-account";
import { createPostfinanceCheckout, feeLabel } from "@/lib/payment/postfinance";
import { createStripeCheckout } from "@/lib/payment/stripe";
import { stripeClient } from "@/lib/payment/stripe-account";

export { mockPaymentsAllowed, PaymentNotConfiguredError };

export interface CardCheckoutLineItem {
  name: string;
  quantity: number;
  unitPriceCents: number;
}

export interface CreateCardCheckoutInput {
  reference: string;
  currency: string;
  customerEmail: string;
  firstName: string;
  lastName: string;
  locale: string;
  successUrl: string;
  cancelUrl: string;
  lineItems: CardCheckoutLineItem[];
  /** Montant exact à encaisser, frais compris et rabais déduit. */
  totalCents: number;
  project: string;
  organizerName?: string;
  customerId?: string;
  feeCents?: number;
  discountCents?: number;
  metadata?: Record<string, string>;
}

export interface CreateCardCheckoutResult {
  provider: "postfinance" | "stripe" | "mock";
  sessionId: string;
  checkoutUrl: string;
  mock: boolean;
}

/** Encaisse sur le compte carte de l'organisateur, jamais sur un autre. */
export async function createCardCheckout(
  account: CardAccount | null,
  input: CreateCardCheckoutInput,
): Promise<CreateCardCheckoutResult> {
  if (account?.provider === "postfinance") {
    return createPostfinanceCheckout(account.account, input);
  }
  if (account?.provider === "stripe") {
    return createStripeCheckout(stripeClient(account.account.secretKey), {
      reference: input.reference,
      currency: input.currency,
      customerEmail: input.customerEmail,
      locale: input.locale,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      lineItems: input.lineItems,
      totalCents: input.totalCents,
      description: input.organizerName
        ? `${input.organizerName} — ${input.reference}`
        : input.reference,
      feeCents: input.feeCents,
      feeLabel: feeLabel(input.locale),
      metadata: input.metadata,
    });
  }

  if (!mockPaymentsAllowed()) throw new PaymentNotConfiguredError();

  return {
    provider: "mock",
    sessionId: `mock_${input.reference}`,
    checkoutUrl: `${input.successUrl}${input.successUrl.includes("?") ? "&" : "?"}mock=1`,
    mock: true,
  };
}
