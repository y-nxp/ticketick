import "server-only";

import { mockPaymentsAllowed } from "@/lib/payment/config";
import { prisma } from "@/lib/prisma";

/**
 * Carte et virement se règlent d'abord sur le spectacle, puis une séance
 * peut les restreindre. Un panier mélangeant plusieurs séances ne propose
 * que l'intersection : on n'offre pas un IBAN qu'une des lignes refuse.
 *
 * Chaque organisateur encaisse sur ses propres comptes (PostFinance ou
 * Stripe, PayPal, IBAN) : un moyen n'est proposé que si tout le panier relève d'un seul
 * organisateur qui l'a activé.
 */

export type PaymentOffer = { card: boolean; iban: boolean; paypal: boolean };

/**
 * Pourquoi rien n'est proposé : l'organisateur n'a encore activé aucun
 * encaissement, ou le panier réunit plusieurs organisateurs.
 */
export type PaymentBlock = "notActivated" | "mixedOrganizers";

export type CartPayments = PaymentOffer & { blocked?: PaymentBlock };

export function inheritPayment(
  event: { acceptCard: boolean; acceptIban: boolean; acceptPaypal: boolean },
  session?: { acceptCard: boolean | null; acceptIban: boolean | null },
): PaymentOffer {
  return {
    card: session?.acceptCard ?? event.acceptCard,
    iban: session?.acceptIban ?? event.acceptIban,
    paypal: event.acceptPaypal,
  };
}

export function intersectOffers(offres: PaymentOffer[]): PaymentOffer {
  return offres.reduce<PaymentOffer>(
    (acc, o) => ({
      card: acc.card && o.card,
      iban: acc.iban && o.iban,
      paypal: acc.paypal && o.paypal,
    }),
    { card: true, iban: true, paypal: true },
  );
}

export async function resolveCartPayments(
  ticketTypeIds: string[],
): Promise<CartPayments> {
  const ids = [...new Set(ticketTypeIds.filter(Boolean))];
  if (ids.length === 0) return { card: false, iban: false, paypal: false };

  const rows = await prisma.ticketType.findMany({
    where: { id: { in: ids } },
    select: {
      session: {
        select: {
          acceptCard: true,
          acceptIban: true,
          event: {
            select: {
              acceptCard: true,
              acceptIban: true,
              acceptPaypal: true,
              organizerId: true,
            },
          },
        },
      },
    },
  });

  if (rows.length !== ids.length) {
    return { card: false, iban: false, paypal: false };
  }

  const organizerIds = [...new Set(rows.map((r) => r.session.event.organizerId))];
  if (organizerIds.length !== 1) {
    return { card: false, iban: false, paypal: false, blocked: "mixedOrganizers" };
  }

  const ready = await organizerPayments(organizerIds[0]!);
  const wanted = intersectOffers(
    rows.map((r) => inheritPayment(r.session.event, r.session)),
  );
  const offer = {
    card: wanted.card && ready.card,
    iban: wanted.iban && ready.iban,
    paypal: wanted.paypal && ready.paypal,
  };
  if (!ready.card && !ready.iban && !ready.paypal) {
    return { ...offer, blocked: "notActivated" };
  }
  return offer;
}

/**
 * Moyens que l'organisateur a activés. La simulation (essai et poste de
 * développement seulement) remplace la carte et le virement manquants.
 */
export async function organizerPayments(organizerId: string): Promise<PaymentOffer> {
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    select: {
      bankIban: true,
      bankBeneficiary: true,
      postfinance: { select: { enabled: true } },
      stripe: { select: { enabled: true } },
      paypal: { select: { enabled: true } },
    },
  });
  const mock = mockPaymentsAllowed();
  return {
    card:
      Boolean(organizer?.postfinance?.enabled) || Boolean(organizer?.stripe?.enabled) || mock,
    iban: Boolean(organizer?.bankIban && organizer.bankBeneficiary) || mock,
    paypal: Boolean(organizer?.paypal?.enabled),
  };
}
