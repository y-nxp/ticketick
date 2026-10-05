import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { settleStripeSession } from "@/lib/orders/settle-card";
import { anyStripeAccountForOrganizer, stripeClient } from "@/lib/payment/stripe-account";

/**
 * Webhook du compte Stripe d'un organisateur, créé par ticketick quand la clé
 * est enregistrée dans l'admin. Signé avec le secret propre à ce compte ; la
 * session est ensuite relue chez Stripe avant d'émettre les billets.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizerId: string }> },
) {
  const { organizerId } = await params;
  const account = await anyStripeAccountForOrganizer(organizerId);
  if (!account?.webhookSecret) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 404 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripeClient(account.secretKey).webhooks.constructEvent(
      await request.text(),
      signature,
      account.webhookSecret,
    );
  } catch {
    return NextResponse.json({ error: "signature_verification_failed" }, { status: 400 });
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    try {
      await settleStripeSession(event.data.object.id);
    } catch (error) {
      console.error("[stripe] webhook", organizerId, error);
      return NextResponse.json({ error: "settle_failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
