import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, isStripeConfigured } from "@/lib/payment/stripe";
import { sendTicketEmail } from "@/lib/email";
import { markOrderPaid } from "@/lib/orders/mark-paid";

// Le webhook a besoin du corps brut pour vérifier la signature.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isStripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "stripe_not_configured" },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid";
    return NextResponse.json(
      { error: `signature_verification_failed: ${message}` },
      { status: 400 },
    );
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      await handlePaidSession(stripe, session);
      break;
    }
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      await handlePaidSession(stripe, session);
      break;
    }
    default:
      // Événement non traité : on l'accuse quand même (200) pour éviter les retries.
      break;
  }

  return NextResponse.json({ received: true });
}

async function handlePaidSession(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
) {
  const reference =
    session.client_reference_id ??
    session.metadata?.reference ??
    session.id;
  const email = session.customer_details?.email ?? session.customer_email ?? "";
  const firstName = session.metadata?.firstName ?? "";
  const currency = (session.currency ?? "chf").toUpperCase();
  const totalCents = session.amount_total ?? 0;

  // Récupère les articles pour l'e-mail.
  let items: { name: string; quantity: number }[] = [];
  try {
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
      limit: 100,
    });
    items = lineItems.data.map((li) => ({
      name: li.description ?? "Billet",
      quantity: li.quantity ?? 1,
    }));
  } catch {
    // best-effort
  }

  const paid = await markOrderPaid({
    reference,
    provider: "stripe",
    providerRef: session.id,
    method: "CARD",
    amountCents: totalCents,
    currency,
  });

  if (!paid.ok) {
    // Journalisé sans relancer d'exception : renvoyer une erreur ferait
    // rejouer l'événement par Stripe alors que rien ne changerait.
    console.error(
      `[stripe] commande ${reference} non soldée : ${paid.error}`,
      { sessionId: session.id, amountCents: totalCents },
    );
    return;
  }

  // Le rejeu d'un même événement ne doit pas renvoyer les billets une
  // seconde fois à l'acheteur.
  if (paid.alreadyPaid) return;

  if (email) {
    await sendTicketEmail({
      to: email,
      firstName,
      reference,
      locale: session.locale ?? "fr",
      paymentMethod: "CARD",
      totalCents,
      currency,
      items,
    });
  }
}
