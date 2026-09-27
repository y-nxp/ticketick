import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Carte et virement se règlent d'abord sur le spectacle, puis une séance
 * peut les restreindre. Un panier mélangeant plusieurs séances ne propose
 * que l'intersection : on n'offre pas un IBAN qu'une des lignes refuse.
 *
 * PayPal encaisse sur le compte de l'organisateur : il n'est proposé que si
 * tout le panier relève d'un seul organisateur dont le compte est configuré.
 */

export type PaymentOffer = { card: boolean; iban: boolean; paypal: boolean };

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
): Promise<PaymentOffer> {
  const ids = [...new Set(ticketTypeIds.filter(Boolean))];
  if (ids.length === 0) return { card: true, iban: true, paypal: false };

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

  const offer = intersectOffers(
    rows.map((r) => inheritPayment(r.session.event, r.session)),
  );
  if (offer.paypal) {
    offer.paypal = await paypalReadyFor(
      rows.map((r) => r.session.event.organizerId),
    );
  }
  return offer;
}

/** Un seul organisateur, et son compte PayPal actif. */
export async function paypalReadyFor(organizerIds: string[]): Promise<boolean> {
  const distinct = [...new Set(organizerIds)];
  if (distinct.length !== 1) return false;
  const account = await prisma.organizerPaypalAccount.findUnique({
    where: { organizerId: distinct[0] },
    select: { enabled: true },
  });
  return Boolean(account?.enabled);
}
