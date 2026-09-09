import { NextResponse } from "next/server";
import { z } from "zod";
import { createCheckoutSession } from "@/lib/payment/stripe";
import { sendTicketEmail } from "@/lib/email";

const lineSchema = z.object({
  ticketTypeId: z.string(),
  ticketName: z.string(),
  eventTitle: z.string(),
  unitPriceCents: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  currency: z.string().default("CHF"),
});

const checkoutSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  locale: z.string().default("fr"),
  paymentMethod: z.enum(["CARD", "IBAN"]),
  lines: z.array(lineSchema).min(1),
});

// IBAN de démonstration (à remplacer par le compte réel de l'organisateur)
const DEMO_IBAN = "CH93 0076 2011 6238 5295 7";
const DEMO_BENEFICIARY = "ticketick SA, Lausanne";

function generateReference() {
  const n = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `TT-${n}`;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = checkoutSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const subtotalCents = data.lines.reduce(
    (sum, l) => sum + l.unitPriceCents * l.quantity,
    0,
  );
  const feeCents = Math.round(subtotalCents * 0.05);
  const totalCents = subtotalCents + feeCents;
  const reference = generateReference();
  const currency = data.lines[0]?.currency ?? "CHF";

  const origin = new URL(request.url).origin;

  if (data.paymentMethod === "CARD") {
    const session = await createCheckoutSession({
      reference,
      currency,
      customerEmail: data.email,
      locale: data.locale,
      // {CHECKOUT_SESSION_ID} est remplacé par Stripe lors de la redirection.
      successUrl: `${origin}/${data.locale}/checkout/success?ref=${reference}&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/${data.locale}/checkout?canceled=1`,
      feeCents,
      lineItems: data.lines.map((l) => ({
        name: `${l.eventTitle} — ${l.ticketName}`,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
      })),
      metadata: {
        firstName: data.firstName,
        lastName: data.lastName,
      },
    });

    // Mode mock (Stripe non configuré) : pas de webhook, on confirme et on
    // envoie l'e-mail immédiatement.
    if (session.mock) {
      await sendTicketEmail({
        to: data.email,
        firstName: data.firstName,
        reference,
        locale: data.locale,
        paymentMethod: "CARD",
        totalCents,
        currency,
        items: data.lines.map((l) => ({
          name: `${l.eventTitle} — ${l.ticketName}`,
          quantity: l.quantity,
        })),
      });
    }
    // En mode réel, l'e-mail des billets est envoyé par le webhook Stripe
    // après confirmation du paiement (checkout.session.completed).

    return NextResponse.json({
      reference,
      status: session.mock ? "PAID" : "AWAITING_PAYMENT",
      checkoutUrl: session.checkoutUrl,
      mock: session.mock,
      totalCents,
      currency,
    });
  }

  // Virement IBAN : commande en attente de paiement, instructions par e-mail.
  await sendTicketEmail({
    to: data.email,
    firstName: data.firstName,
    reference,
    locale: data.locale,
    paymentMethod: "IBAN",
    totalCents,
    currency,
    items: data.lines.map((l) => ({
      name: `${l.eventTitle} — ${l.ticketName}`,
      quantity: l.quantity,
    })),
    ibanInstructions: {
      iban: DEMO_IBAN,
      beneficiary: DEMO_BENEFICIARY,
      amountCents: totalCents,
      reference,
    },
  });

  return NextResponse.json({
    reference,
    status: "AWAITING_PAYMENT",
    iban: DEMO_IBAN,
    beneficiary: DEMO_BENEFICIARY,
    totalCents,
    currency,
  });
}
