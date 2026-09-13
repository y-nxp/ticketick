import "server-only";

import {
  mockPaymentsAllowed,
  PaymentNotConfiguredError,
} from "@/lib/payment/config";
import {
  createPostfinanceCheckout,
  isPostfinanceConfigured,
} from "@/lib/payment/postfinance";
import {
  createStripeCheckout,
  isStripeConfigured,
} from "@/lib/payment/stripe";

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
  feeCents?: number;
  metadata?: Record<string, string>;
}

export interface CreateCardCheckoutResult {
  provider: "postfinance" | "stripe" | "mock";
  sessionId: string;
  checkoutUrl: string;
  mock: boolean;
}

export async function createCardCheckout(
  input: CreateCardCheckoutInput,
): Promise<CreateCardCheckoutResult> {
  if (isPostfinanceConfigured()) {
    return createPostfinanceCheckout(input);
  }

  if (isStripeConfigured()) {
    return createStripeCheckout(input);
  }

  if (!mockPaymentsAllowed()) throw new PaymentNotConfiguredError();

  return {
    provider: "mock",
    sessionId: `mock_${input.reference}`,
    checkoutUrl: `${input.successUrl}${input.successUrl.includes("?") ? "&" : "?"}mock=1`,
    mock: true,
  };
}
