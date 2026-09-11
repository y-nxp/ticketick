import { NextResponse } from "next/server";
import * as z from "zod";
import { createCheckoutSession } from "@/lib/payment/stripe";
import { sendTicketEmail } from "@/lib/email";
import { createOrder } from "@/lib/orders/create-order";
import { markOrderPaid } from "@/lib/orders/mark-paid";
import { getCurrentUser } from "@/lib/auth/dal";

/**
 * Seuls l'identifiant du tarif et la quantité sont acceptés. Le libellé et le
 * prix affichés par le navigateur ne sont pas repris : ils sont relus en base,
 * faute de quoi l'acheteur fixerait lui-même le montant à payer.
 */
const lineSchema = z.object({
  ticketTypeId: z.string().min(1),
  quantity: z.number().int().positive().max(100),
});

const checkoutSchema = z.object({
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  email: z.email().max(200),
  phone: z.string().max(40).optional(),
  locale: z.string().max(5).default("fr"),
  paymentMethod: z.enum(["CARD", "IBAN"]),
  lines: z.array(lineSchema).min(1).max(50),
});

// IBAN de démonstration (à remplacer par le compte réel de l'organisateur)
const DEMO_IBAN = "CH93 0076 2011 6238 5295 7";
const DEMO_BENEFICIARY = "ticketick SA, Lausanne";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = checkoutSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // Rattache la commande au compte si l'acheteur est connecté, sans l'exiger :
  // l'achat reste possible sans création de compte.
  const user = await getCurrentUser();

  const created = await createOrder({
    lines: data.lines,
    email: data.email,
    firstName: data.firstName,
    lastName: data.lastName,
    phone: data.phone,
    locale: data.locale,
    paymentMethod: data.paymentMethod,
    userId: user?.id,
  });

  if (!created.ok) {
    // 409 : la demande était bien formée, c'est l'état du catalogue qui s'y
    // oppose — stock épuisé, vente fermée, tarif disparu.
    return NextResponse.json(
      { error: created.error, ticketTypeId: created.ticketTypeId },
      { status: 409 },
    );
  }

  const order = created.order;
  const origin = new URL(request.url).origin;

  if (data.paymentMethod === "CARD") {
    const session = await createCheckoutSession({
      reference: order.reference,
      currency: order.currency,
      customerEmail: data.email,
      locale: data.locale,
      successUrl: `${origin}/${data.locale}/checkout/success?ref=${order.reference}&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/${data.locale}/checkout?canceled=1`,
      feeCents: order.feeCents,
      lineItems: order.lines.map((l) => ({
        name: l.label,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
      })),
      metadata: {
        firstName: data.firstName,
        lastName: data.lastName,
        reference: order.reference,
      },
    });

    // Mode mock (Stripe non configuré) : aucun webhook ne viendra confirmer,
    // la commande est donc soldée ici même.
    if (session.mock) {
      await markOrderPaid({
        reference: order.reference,
        provider: "mock",
        method: "CARD",
        amountCents: order.totalCents,
        currency: order.currency,
      });

      await sendTicketEmail({
        to: data.email,
        firstName: data.firstName,
        reference: order.reference,
        locale: data.locale,
        paymentMethod: "CARD",
        totalCents: order.totalCents,
        currency: order.currency,
        items: order.lines.map((l) => ({
          name: l.label,
          quantity: l.quantity,
        })),
      });
    }

    return NextResponse.json({
      reference: order.reference,
      status: session.mock ? "PAID" : "AWAITING_PAYMENT",
      checkoutUrl: session.checkoutUrl,
      mock: session.mock,
      totalCents: order.totalCents,
      currency: order.currency,
    });
  }

  // Virement : la commande reste en attente, le stock est déjà retenu.
  await sendTicketEmail({
    to: data.email,
    firstName: data.firstName,
    reference: order.reference,
    locale: data.locale,
    paymentMethod: "IBAN",
    totalCents: order.totalCents,
    currency: order.currency,
    items: order.lines.map((l) => ({ name: l.label, quantity: l.quantity })),
    ibanInstructions: {
      iban: DEMO_IBAN,
      beneficiary: DEMO_BENEFICIARY,
      amountCents: order.totalCents,
      reference: order.reference,
    },
  });

  return NextResponse.json({
    reference: order.reference,
    status: "AWAITING_PAYMENT",
    iban: DEMO_IBAN,
    beneficiary: DEMO_BENEFICIARY,
    totalCents: order.totalCents,
    currency: order.currency,
  });
}
