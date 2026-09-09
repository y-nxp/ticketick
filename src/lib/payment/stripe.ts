import Stripe from "stripe";

/**
 * Intégration Stripe (paiement par carte via Stripe Checkout hébergé).
 *
 * Variables d'environnement (secrets GitHub) :
 *   STRIPE_SECRET_KEY       — clé secrète serveur (sk_...)
 *   STRIPE_WEBHOOK_SECRET   — secret de signature du webhook (whsec_...)
 *   STRIPE_PUBLISHABLE_KEY  — clé publique (pk_...) exposée au client si besoin
 *
 * Flux : le serveur crée une Checkout Session -> l'utilisateur est redirigé
 * vers la page de paiement Stripe -> Stripe appelle notre webhook
 * (`checkout.session.completed`) -> la commande est marquée payée et les
 * billets sont émis.
 *
 * Sans clé configurée, on fonctionne en mode mock (aucun appel réseau).
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

const SUPPORTED_LOCALES = ["fr", "en", "de", "it"] as const;

export async function createCheckoutSession(
  input: CreateCheckoutInput,
): Promise<CreateCheckoutResult> {
  if (!isStripeConfigured()) {
    return {
      provider: "stripe",
      sessionId: `mock_${input.reference}`,
      checkoutUrl: `${input.successUrl}&mock=1`,
      mock: true,
    };
  }

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
