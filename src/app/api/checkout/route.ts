import { NextResponse } from "next/server";
import * as z from "zod";
import {
  createCardCheckout,
  mockPaymentsAllowed,
  PaymentNotConfiguredError,
} from "@/lib/payment/card";
import { sendTicketEmail } from "@/lib/email";
import { sendPaidOrderTickets } from "@/lib/email/ticket-mail";
import {
  createOrder,
  fulfillCheckoutHold,
  releaseOrder,
  releaseOrderByReference,
  releaseStaleUnpaidCardOrders,
} from "@/lib/orders/create-order";
import { markOrderPaid } from "@/lib/orders/mark-paid";
import { getCurrentUser } from "@/lib/auth/dal";
import { publicAppOrigin } from "@/lib/app-url";
import { prisma } from "@/lib/prisma";
import { reservedUntilFrom } from "@/lib/orders/reservation";

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
  holdReference: z.string().min(3).max(32).optional(),
  options: z
    .array(
      z.object({
        optionId: z.string().min(1),
        choiceIds: z.array(z.string().min(1)).max(20),
      }),
    )
    .max(20)
    .optional(),
});

// IBAN d'exemple, réservé aux environnements d'essai. Envoyé à un acheteur
// réel, il l'inviterait à virer de l'argent sur un compte qui n'existe pas :
// il n'est donc utilisé que là où le paiement simulé est explicitement permis.
const DEMO_IBAN = "CH93 0076 2011 6238 5295 7";
const DEMO_BENEFICIARY = "ticketick SA, Lausanne";

/** Coordonnées bancaires réelles, ou `null` si aucune n'est configurée. */
function bankDetails(): { iban: string; beneficiary: string } | null {
  const iban = process.env.BANK_IBAN?.trim();
  const beneficiary = process.env.BANK_BENEFICIARY?.trim();
  if (iban && beneficiary) return { iban, beneficiary };
  if (mockPaymentsAllowed()) {
    return { iban: DEMO_IBAN, beneficiary: DEMO_BENEFICIARY };
  }
  return null;
}

/**
 * Le stock a déjà été retenu par `createOrder`. Si l'encaissement ne peut pas
 * aboutir, il faut le rendre : sans cela chaque tentative échouée retirerait
 * définitivement des places de la vente.
 */
async function refusePayment(orderId: string) {
  await releaseOrder(orderId).catch((error) => {
    console.error("[checkout] libération du stock impossible", error);
  });
  return NextResponse.json({ error: "payment_unavailable" }, { status: 503 });
}

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

  // Les tentatives carte échouées retenaient le stock (500 après createOrder).
  // On rend d'abord les places des commandes qui n'ont jamais atteint PF.
  await releaseStaleUnpaidCardOrders().catch((error) => {
    console.error("[checkout] nettoyage des commandes périmées", error);
  });

  // Rattache la commande au compte si l'acheteur est connecté, sans l'exiger :
  // l'achat reste possible sans création de compte.
  const user = await getCurrentUser();

  const payload = {
    lines: data.lines,
    email: data.email,
    firstName: data.firstName,
    lastName: data.lastName,
    phone: data.phone,
    locale: data.locale,
    paymentMethod: data.paymentMethod,
    userId: user?.id,
    options: data.options,
  };

  // La rétention a déjà prélevé le stock à l'arrivée sur /checkout.
  // On la relie aux coordonnées plutôt que de créer une seconde commande.
  let created = data.holdReference
    ? await fulfillCheckoutHold(data.holdReference, payload)
    : await createOrder(payload);

  if (!created.ok && data.holdReference) {
    if (created.error === "hold_mismatch") {
      await releaseOrderByReference(data.holdReference).catch((error) => {
        console.error("[checkout] libération rétention incompatible", error);
      });
    }
    created = await createOrder(payload);
  }

  if (!created.ok) {
    // 409 : la demande était bien formée, c'est l'état du catalogue qui s'y
    // oppose — stock épuisé, vente fermée, tarif disparu.
    return NextResponse.json(
      { error: created.error, ticketTypeId: created.ticketTypeId },
      { status: 409 },
    );
  }

  const order = created.order;
  const origin = publicAppOrigin(request);

  if (data.paymentMethod === "CARD") {
    let session;
    try {
      session = await createCardCheckout({
        reference: order.reference,
        currency: order.currency,
        customerEmail: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        locale: data.locale,
        successUrl: `${origin}/${data.locale}/checkout/success?ref=${order.reference}`,
        cancelUrl: `${origin}/${data.locale}/checkout?canceled=1`,
        project: order.project,
        organizerName: order.organizerName,
        customerId: user?.id,
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
    } catch (error) {
      if (error instanceof PaymentNotConfiguredError) {
        console.error("[checkout] paiement par carte indisponible", error);
        return refusePayment(order.id);
      }
      // Toute autre erreur (API PostFinance, JWT, réseau) laisserait sinon
      // un 500 et des places bloquées jusqu'à la séance.
      console.error("[checkout] création PostFinance impossible", error);
      return refusePayment(order.id);
    }

    if (session.provider === "postfinance") {
      try {
        await prisma.payment.upsert({
          where: { orderId: order.id },
          create: {
            orderId: order.id,
            provider: "postfinance",
            providerRef: session.sessionId,
            method: "CARD",
            status: "PENDING",
            amountCents: order.totalCents,
            currency: order.currency,
          },
          update: { providerRef: session.sessionId },
        });
      } catch (error) {
        console.error("[checkout] enregistrement du paiement", error);
        return refusePayment(order.id);
      }
    }

    // Paiement simulé : aucun webhook ne viendra confirmer, la commande est
    // donc soldée ici même. N'arrive que si `ALLOW_MOCK_PAYMENTS` l'autorise.
    if (session.mock) {
      const paid = await markOrderPaid({
        reference: order.reference,
        provider: "mock",
        method: "CARD",
        amountCents: order.totalCents,
        currency: order.currency,
      });
      if (paid.ok && !paid.alreadyPaid) {
        await sendPaidOrderTickets(paid.orderId);
      }
    }

    return NextResponse.json({
      reference: order.reference,
      status: session.mock ? "PAID" : "AWAITING_PAYMENT",
      checkoutUrl: session.checkoutUrl,
      mock: session.mock,
      totalCents: order.totalCents,
      currency: order.currency,
      reservedUntil: reservedUntilFrom(order.createdAt).toISOString(),
    });
  }

  // Virement : la commande reste en attente, le stock est déjà retenu.
  const bank = bankDetails();
  if (!bank) {
    console.error("[checkout] virement indisponible : BANK_IBAN absent");
    return refusePayment(order.id);
  }

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
      iban: bank.iban,
      beneficiary: bank.beneficiary,
      amountCents: order.totalCents,
      reference: order.reference,
    },
  });

  return NextResponse.json({
    reference: order.reference,
    status: "AWAITING_PAYMENT",
    iban: bank.iban,
    beneficiary: bank.beneficiary,
    totalCents: order.totalCents,
    currency: order.currency,
  });
}
