import { randomBytes } from "node:crypto";
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
  hashHoldToken,
  releaseHeldOrder,
  releaseOrder,
  releaseStaleUnpaidCardOrders,
} from "@/lib/orders/create-order";
import { markOrderPaid } from "@/lib/orders/mark-paid";
import { getCurrentUser } from "@/lib/auth/dal";
import { publicAppOrigin } from "@/lib/app-url";
import { prisma } from "@/lib/prisma";
import { reservedUntilFrom } from "@/lib/orders/reservation";
import { clientIpFrom, consume } from "@/lib/rate-limit";
import { createPaypalOrder, paypalAccountFor } from "@/lib/payment/paypal";
import { postfinanceAccountFor } from "@/lib/payment/postfinance-account";

/**
 * Seuls l'identifiant du tarif et la quantité sont acceptés. Le libellé et le
 * prix affichés par le navigateur ne sont pas repris : ils sont relus en base,
 * faute de quoi l'acheteur fixerait lui-même le montant à payer.
 */
const lineSchema = z.object({
  ticketTypeId: z.string().min(1),
  quantity: z.number().int().positive().max(100),
  seats: z.array(z.string().min(1).max(40)).max(100).optional(),
});

const attendeeSchema = z.object({
  ticketTypeId: z.string().min(1),
  name: z.string().max(120),
  birthDate: z.string().max(10),
});

const checkoutSchema = z.object({
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  email: z.email().max(200),
  phone: z.string().max(40).optional(),
  locale: z.string().max(5).default("fr"),
  paymentMethod: z.enum(["CARD", "IBAN", "PAYPAL", "FREE"]),
  lines: z.array(lineSchema).min(1).max(50),
  holdReference: z.string().min(3).max(32).optional(),
  holdToken: z.string().min(16).max(64).optional(),
  options: z
    .array(
      z.object({
        optionId: z.string().min(1),
        choiceIds: z.array(z.string().min(1)).max(20),
      }),
    )
    .max(20)
    .optional(),
  attendees: z.array(attendeeSchema).max(100).optional(),
});

// IBAN d'exemple, réservé aux environnements d'essai. Envoyé à un acheteur
// réel, il l'inviterait à virer de l'argent sur un compte qui n'existe pas :
// il n'est donc utilisé que là où le paiement simulé est explicitement permis.
const DEMO_IBAN = "CH93 0076 2011 6238 5295 7";
const DEMO_BENEFICIARY = "ticketick SA, Lausanne";

/**
 * Compte bancaire de l'unique organisateur du panier, ou `null` s'il n'en a
 * pas renseigné : le virement arrive chez lui, jamais sur un compte commun.
 */
async function bankDetails(
  organizerIds: string[],
): Promise<{ iban: string; beneficiary: string } | null> {
  const distinct = [...new Set(organizerIds)];
  if (distinct.length === 1) {
    const organizer = await prisma.organizer.findUnique({
      where: { id: distinct[0] },
      select: { bankIban: true, bankBeneficiary: true },
    });
    const iban = organizer?.bankIban?.trim();
    const beneficiary = organizer?.bankBeneficiary?.trim();
    if (iban && beneficiary) return { iban, beneficiary };
  }
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

  // Une commande par virement garde ses places jusqu'à annulation manuelle :
  // c'est la voie la plus chère à laisser ouverte sans limite.
  if (!consume(`checkout:${clientIpFrom(request.headers)}`, 10, 10 * 60_000)) {
    return NextResponse.json({ error: "throttled" }, { status: 429 });
  }

  // Les tentatives carte échouées retenaient le stock (500 après createOrder).
  // On rend d'abord les places des commandes qui n'ont jamais atteint PF.
  await releaseStaleUnpaidCardOrders().catch((error) => {
    console.error("[checkout] nettoyage des commandes périmées", error);
  });

  // Rattache la commande au compte si l'acheteur est connecté, sans l'exiger :
  // l'achat reste possible sans création de compte.
  const user = await getCurrentUser();

  // Une commande créée ici, sans rétention préalable, reçoit son propre jeton :
  // au retour de PostFinance, le navigateur peut encore la reprendre ou la
  // libérer, et personne d'autre.
  const freshToken = randomBytes(24).toString("base64url");
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
    attendees: data.attendees,
    requireAttendees: true,
    holdTokenHash:
      data.paymentMethod === "CARD" || data.paymentMethod === "PAYPAL"
        ? hashHoldToken(freshToken)
        : undefined,
  };

  // La rétention a déjà prélevé le stock à l'arrivée sur /checkout.
  // On la relie aux coordonnées plutôt que de créer une seconde commande.
  const holdToken = data.holdToken ?? "";
  let created = data.holdReference
    ? await fulfillCheckoutHold(data.holdReference, holdToken, payload)
    : await createOrder(payload);
  let token = data.holdReference && created.ok ? holdToken : freshToken;

  if (!created.ok && data.holdReference) {
    if (created.error === "hold_mismatch") {
      await releaseHeldOrder(data.holdReference, holdToken).catch((error) => {
        console.error("[checkout] libération rétention incompatible", error);
      });
    }
    created = await createOrder(payload);
    token = freshToken;
  }

  if (!created.ok) {
    // 409 : la demande était bien formée, c'est l'état du catalogue qui s'y
    // oppose — stock épuisé, vente fermée, tarif disparu.
    return NextResponse.json(
      {
        error: created.error,
        ticketTypeId: created.ticketTypeId,
        seatKeys: created.seatKeys,
      },
      { status: 409 },
    );
  }

  const order = created.order;
  const origin = publicAppOrigin(request);

  // Rien à encaisser (concert gratuit, gratuités seules) : la commande est
  // soldée tout de suite et les billets partent, sans passer par un
  // prestataire qui refuserait un montant nul.
  if (order.totalCents === 0) {
    const paid = await markOrderPaid({
      reference: order.reference,
      provider: "free",
      method: "FREE",
      amountCents: 0,
      currency: order.currency,
    });
    if (!paid.ok) {
      console.error("[checkout] commande gratuite non soldée", order.reference, paid.error);
      return refusePayment(order.id);
    }
    if (!paid.alreadyPaid) await sendPaidOrderTickets(paid.orderId);
    return NextResponse.json({
      reference: order.reference,
      status: "PAID",
      free: true,
      totalCents: 0,
      currency: order.currency,
    });
  }

  if (data.paymentMethod === "PAYPAL") {
    let approval;
    try {
      const account = await paypalAccountFor(order.organizerIds);
      if (!account) {
        console.error("[checkout] PayPal non configuré pour", order.organizerIds);
        return refusePayment(order.id);
      }
      approval = await createPaypalOrder(account, {
        reference: order.reference,
        amountCents: order.totalCents,
        currency: order.currency,
        description: `${order.organizerName} — ${order.reference}`,
        brandName: order.organizerName,
        locale: data.locale,
        returnUrl: `${origin}/api/paypal/return?ref=${order.reference}&locale=${data.locale}`,
        cancelUrl: `${origin}/${data.locale}/checkout?canceled=1`,
      });
      await prisma.payment.upsert({
        where: { orderId: order.id },
        create: {
          orderId: order.id,
          provider: "paypal",
          providerRef: approval.id,
          method: "PAYPAL",
          status: "PENDING",
          amountCents: order.totalCents,
          currency: order.currency,
        },
        update: {
          provider: "paypal",
          providerRef: approval.id,
          method: "PAYPAL",
          amountCents: order.totalCents,
        },
      });
    } catch (error) {
      console.error("[checkout] création PayPal impossible", error);
      return refusePayment(order.id);
    }

    return NextResponse.json({
      reference: order.reference,
      holdToken: token,
      status: "AWAITING_PAYMENT",
      checkoutUrl: approval.approveUrl,
      totalCents: order.totalCents,
      currency: order.currency,
      reservedUntil: reservedUntilFrom(order.createdAt).toISOString(),
    });
  }

  if (data.paymentMethod === "CARD") {
    let session;
    try {
      const account = await postfinanceAccountFor(order.organizerIds);
      session = await createCardCheckout(account, {
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
        discountCents: order.discountCents,
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
        console.error("[checkout] paiement par carte indisponible", order.organizerIds, error);
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
      holdToken: token,
      status: session.mock ? "PAID" : "AWAITING_PAYMENT",
      checkoutUrl: session.checkoutUrl,
      mock: session.mock,
      totalCents: order.totalCents,
      currency: order.currency,
      reservedUntil: reservedUntilFrom(order.createdAt).toISOString(),
    });
  }

  // Virement : la commande reste en attente, le stock est déjà retenu.
  const bank = await bankDetails(order.organizerIds);
  if (!bank) {
    console.error("[checkout] virement indisponible : IBAN de l'organisateur absent", order.organizerIds);
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
