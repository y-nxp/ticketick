import "server-only";

import { prisma } from "@/lib/prisma";
import type { PostfinanceCredentials } from "./postfinance";
import { openSecret } from "./secret-box";

/**
 * Espace PostFinance de l'organisateur qui vend. Il n'y a pas d'espace
 * commun : sans compte à lui, l'organisateur n'encaisse pas par carte.
 */

export interface PostfinanceAccount extends PostfinanceCredentials {
  organizerId: string;
  organizerName: string;
}

type Row = {
  organizerId: string;
  spaceId: number;
  userId: number;
  secretEnc: string;
  spaceViewId: number | null;
  organizer: { name: string };
};

const select = {
  organizerId: true,
  spaceId: true,
  userId: true,
  secretEnc: true,
  spaceViewId: true,
  organizer: { select: { name: true } },
} as const;

function toAccount(row: Row): PostfinanceAccount | null {
  try {
    return {
      organizerId: row.organizerId,
      organizerName: row.organizer.name,
      spaceId: row.spaceId,
      userId: row.userId,
      secret: openSecret(row.secretEnc),
      spaceViewId: row.spaceViewId ?? undefined,
    };
  } catch (error) {
    // Clé de chiffrement changée : le secret est à ressaisir dans l'admin.
    console.error("[postfinance] secret illisible pour", row.organizerId, error);
    return null;
  }
}

/** Compte actif de l'unique organisateur du panier, sinon `null`. */
export async function postfinanceAccountFor(
  organizerIds: string[],
): Promise<PostfinanceAccount | null> {
  const distinct = [...new Set(organizerIds)];
  if (distinct.length !== 1) return null;
  const row = await prisma.organizerPostfinanceAccount.findFirst({
    where: { organizerId: distinct[0], enabled: true },
    select,
  });
  return row ? toAccount(row) : null;
}

/**
 * Compte de l'organisateur d'une commande déjà passée, même désactivé
 * depuis : un paiement fait doit pouvoir être constaté.
 */
export async function postfinanceAccountForOrder(
  reference: string,
): Promise<PostfinanceAccount | null> {
  const items = await prisma.orderItem.findMany({
    where: { order: { reference } },
    select: {
      ticketType: {
        select: { session: { select: { event: { select: { organizerId: true } } } } },
      },
    },
  });
  const distinct = [...new Set(items.map((i) => i.ticketType.session.event.organizerId))];
  if (distinct.length !== 1) return null;
  const row = await prisma.organizerPostfinanceAccount.findUnique({
    where: { organizerId: distinct[0] },
    select,
  });
  return row ? toAccount(row) : null;
}

/** Tous les espaces actifs : les cartes enregistrées y sont réparties. */
export async function enabledPostfinanceAccounts(): Promise<PostfinanceAccount[]> {
  const rows = await prisma.organizerPostfinanceAccount.findMany({
    where: { enabled: true },
    select,
  });
  return rows.map(toAccount).filter((a): a is PostfinanceAccount => a !== null);
}
