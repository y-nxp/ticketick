import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Carte et virement se règlent d'abord sur le spectacle, puis une séance
 * peut les restreindre. Un panier mélangeant plusieurs séances ne propose
 * que l'intersection : on n'offre pas un IBAN qu'une des lignes refuse.
 */

export type PaymentOffer = { card: boolean; iban: boolean };

export function inheritPayment(
  event: { acceptCard: boolean; acceptIban: boolean },
  session?: { acceptCard: boolean | null; acceptIban: boolean | null },
): PaymentOffer {
  return {
    card: session?.acceptCard ?? event.acceptCard,
    iban: session?.acceptIban ?? event.acceptIban,
  };
}

export function intersectOffers(offres: PaymentOffer[]): PaymentOffer {
  return offres.reduce<PaymentOffer>(
    (acc, o) => ({ card: acc.card && o.card, iban: acc.iban && o.iban }),
    { card: true, iban: true },
  );
}

export async function resolveCartPayments(
  ticketTypeIds: string[],
): Promise<PaymentOffer> {
  const ids = [...new Set(ticketTypeIds.filter(Boolean))];
  if (ids.length === 0) return { card: true, iban: true };

  const rows = await prisma.ticketType.findMany({
    where: { id: { in: ids } },
    select: {
      session: {
        select: {
          acceptCard: true,
          acceptIban: true,
          event: { select: { acceptCard: true, acceptIban: true } },
        },
      },
    },
  });

  if (rows.length !== ids.length) return { card: false, iban: false };

  return intersectOffers(
    rows.map((r) => inheritPayment(r.session.event, r.session)),
  );
}
