import "server-only";

import { prisma } from "@/lib/prisma";
import {
  postfinanceAccountFor,
  type PostfinanceAccount,
} from "./postfinance-account";
import { stripeAccountForOrganizer, type StripeAccount } from "./stripe-account";

/**
 * Compte qui encaisse la carte pour un organisateur : PostFinance ou Stripe.
 * Quand les deux sont actifs, son réglage `cardProvider` tranche ; si le
 * prestataire choisi est désactivé, l'autre prend le relais.
 */

export type CardProvider = "postfinance" | "stripe";

export type CardAccount =
  | { provider: "postfinance"; account: PostfinanceAccount }
  | { provider: "stripe"; account: StripeAccount };

export function isCardProvider(value: unknown): value is CardProvider {
  return value === "postfinance" || value === "stripe";
}

/** Prestataire retenu d'après ce qui est actif, sans rien lire en base. */
export function pickCardProvider(input: {
  preferred: string | null;
  postfinance: boolean;
  stripe: boolean;
}): CardProvider | null {
  const order: CardProvider[] =
    input.preferred === "stripe" ? ["stripe", "postfinance"] : ["postfinance", "stripe"];
  return order.find((p) => input[p]) ?? null;
}

export async function cardAccountForOrganizer(
  organizerId: string,
): Promise<CardAccount | null> {
  const [organizer, postfinance, stripe] = await Promise.all([
    prisma.organizer.findUnique({ where: { id: organizerId }, select: { cardProvider: true } }),
    postfinanceAccountFor([organizerId]),
    stripeAccountForOrganizer(organizerId),
  ]);
  const provider = pickCardProvider({
    preferred: organizer?.cardProvider ?? null,
    postfinance: postfinance !== null,
    stripe: stripe !== null,
  });
  if (provider === "postfinance" && postfinance) return { provider, account: postfinance };
  if (provider === "stripe" && stripe) return { provider, account: stripe };
  return null;
}

/** Compte de l'unique organisateur du panier, sinon `null`. */
export async function cardAccountFor(organizerIds: string[]): Promise<CardAccount | null> {
  const distinct = [...new Set(organizerIds)];
  if (distinct.length !== 1) return null;
  return cardAccountForOrganizer(distinct[0]!);
}

/** Organisateur d'une commande, s'il est unique. */
export async function organizerOfOrder(reference: string): Promise<string | null> {
  const items = await prisma.orderItem.findMany({
    where: { order: { reference } },
    select: {
      ticketType: {
        select: { session: { select: { event: { select: { organizerId: true } } } } },
      },
    },
  });
  const distinct = [...new Set(items.map((i) => i.ticketType.session.event.organizerId))];
  return distinct.length === 1 ? distinct[0]! : null;
}

export async function cardAccountForOrder(reference: string): Promise<CardAccount | null> {
  const organizerId = await organizerOfOrder(reference);
  return organizerId ? cardAccountForOrganizer(organizerId) : null;
}
