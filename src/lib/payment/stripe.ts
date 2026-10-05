import Stripe from "stripe";

/**
 * Le Stripe de ticketick (`STRIPE_SECRET_KEY`) sert à facturer les
 * organisateurs. Les billets payés par Stripe passent par le compte de
 * l'organisateur (`stripe-account.ts`), avec les fonctions ci-dessous.
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
 * Rembourse tout ou partie d'un paiement de billets passé par Stripe
 * (`sessionId` : identifiant de la session Checkout).
 */
export async function refundStripeSession(
  stripe: Stripe,
  input: { sessionId: string; amountCents: number; idempotencyKey: string },
): Promise<{ id: string; status: string | null }> {
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
  totalCents: number;
  description: string;
  feeCents?: number;
  feeLabel?: string;
  metadata?: Record<string, string>;
}

export interface CreateCheckoutResult {
  provider: "stripe";
  sessionId: string;
  checkoutUrl: string;
  mock: false;
}

const SUPPORTED_LOCALES = ["fr", "en", "de", "it", "es"] as const;

// Minimum accepté par Stripe pour l'expiration d'une session Checkout.
const SESSION_LIFETIME_MS = 30 * 60 * 1000;

export async function createStripeCheckout(
  stripe: Stripe,
  input: CreateCheckoutInput,
): Promise<CreateCheckoutResult> {
  const currency = input.currency.toLowerCase();

  const items = input.lineItems.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
  }));
  if (input.feeCents && input.feeCents > 0) {
    items.push({ name: input.feeLabel ?? "Frais", quantity: 1, unitPriceCents: input.feeCents });
  }
  // Stripe n'accepte pas de ligne négative : un rabais, ou tout écart avec
  // le total de la commande, ramène le détail à une seule ligne au bon montant.
  const sum = items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);
  const lines =
    sum === input.totalCents
      ? items
      : [{ name: input.description, quantity: 1, unitPriceCents: input.totalCents }];

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = lines.map((item) => ({
    quantity: item.quantity,
    price_data: {
      currency,
      unit_amount: item.unitPriceCents,
      product_data: { name: item.name.slice(0, 250) },
    },
  }));

  const locale = (SUPPORTED_LOCALES as readonly string[]).includes(input.locale)
    ? (input.locale as Stripe.Checkout.SessionCreateParams.Locale)
    : "auto";

  const metadata = { reference: input.reference, ...input.metadata };
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    customer_email: input.customerEmail,
    client_reference_id: input.reference,
    locale,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    expires_at: Math.floor((Date.now() + SESSION_LIFETIME_MS) / 1000),
    metadata,
    payment_intent_data: {
      description: input.description.slice(0, 1000),
      metadata,
    },
  });
  if (!session.url) throw new Error("Stripe : session sans adresse de paiement");

  return {
    provider: "stripe",
    sessionId: session.id,
    checkoutUrl: session.url,
    mock: false,
  };
}

export interface PaidStripeSession {
  sessionId: string;
  reference: string | null;
  amountCents: number;
  currency: string;
}

/** Relit une session chez Stripe : payée, avec son montant, sinon `null`. */
export async function readPaidStripeSession(
  stripe: Stripe,
  sessionId: string,
): Promise<PaidStripeSession | null> {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== "paid" || session.amount_total == null) return null;
  return {
    sessionId: session.id,
    reference: session.client_reference_id ?? session.metadata?.reference ?? null,
    amountCents: session.amount_total,
    currency: (session.currency ?? "chf").toUpperCase(),
  };
}
