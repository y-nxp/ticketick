import "server-only";

import {
  mockPaymentsAllowed,
  PaymentNotConfiguredError,
} from "@/lib/payment/config";
import { createPostfinanceCheckout } from "@/lib/payment/postfinance";
import type { PostfinanceAccount } from "@/lib/payment/postfinance-account";

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
  project: string;
  organizerName?: string;
  customerId?: string;
  feeCents?: number;
  discountCents?: number;
  metadata?: Record<string, string>;
}

export interface CreateCardCheckoutResult {
  provider: "postfinance" | "mock";
  sessionId: string;
  checkoutUrl: string;
  mock: boolean;
}

/** Encaisse sur l'espace PostFinance de l'organisateur, jamais sur un autre. */
export async function createCardCheckout(
  account: PostfinanceAccount | null,
  input: CreateCardCheckoutInput,
): Promise<CreateCardCheckoutResult> {
  if (account) {
    return createPostfinanceCheckout(account, input);
  }

  if (!mockPaymentsAllowed()) throw new PaymentNotConfiguredError();

  return {
    provider: "mock",
    sessionId: `mock_${input.reference}`,
    checkoutUrl: `${input.successUrl}${input.successUrl.includes("?") ? "&" : "?"}mock=1`,
    mock: true,
  };
}
