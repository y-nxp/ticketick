import Stripe from "stripe";

/**
 * Stripe sert à facturer les organisateurs (abonnement / honoraires
 * ticketick). L'achat de billets passe par le PostFinance du client,
 * jamais par ici.
 */

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY manquant");
  }
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

/**
 * Rembourse tout ou partie d'un ancien paiement de billets passé par Stripe
 * (`providerRef` : identifiant de la session Checkout).
 */
export async function refundStripeSession(input: {
  sessionId: string;
  amountCents: number;
  idempotencyKey: string;
}): Promise<{ id: string; status: string | null }> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(input.sessionId);
  const intent =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;
  if (!intent) throw new Error("Stripe : session sans paiement");
  const refund = await stripe.refunds.create(
    { payment_intent: intent, amount: input.amountCents },
    { idempotencyKey: input.idempotencyKey },
  );
  return { id: refund.id, status: refund.status };
}

export interface CheckoutLineItem {
  name: string;
  quantity: number;
  unitPriceCents: number;
}

export interface CreateCheckoutInput {
  reference: string;
  currency: string;
  customerEmail: string;
  locale: string;
  successUrl: string;
  cancelUrl: string;
  lineItems: CheckoutLineItem[];
  feeCents?: number;
  metadata?: Record<string, string>;
}

export interface CreateCheckoutResult {
  provider: "stripe";
  sessionId: string;
  checkoutUrl: string;
  mock: boolean;
}

const SUPPORTED_LOCALES = ["fr", "en", "de", "it", "es"] as const;

export async function createStripeCheckout(
  input: CreateCheckoutInput,
): Promise<CreateCheckoutResult> {
  const stripe = getStripe();
  const currency = input.currency.toLowerCase();

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] =
    input.lineItems.map((item) => ({
      quantity: item.quantity,
      price_data: {
        currency,
        unit_amount: item.unitPriceCents,
        product_data: { name: item.name },
      },
    }));

  if (input.feeCents && input.feeCents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency,
        unit_amount: input.feeCents,
        product_data: { name: "Frais de service" },
      },
    });
  }

  const locale = (SUPPORTED_LOCALES as readonly string[]).includes(input.locale)
    ? (input.locale as Stripe.Checkout.SessionCreateParams.Locale)
    : "auto";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    customer_email: input.customerEmail,
    client_reference_id: input.reference,
    locale,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: { reference: input.reference, ...input.metadata },
  });

  return {
    provider: "stripe",
    sessionId: session.id,
    checkoutUrl: session.url ?? input.successUrl,
    mock: false,
  };
}
