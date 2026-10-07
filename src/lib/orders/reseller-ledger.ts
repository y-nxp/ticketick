import "server-only";

import type { LedgerEntryType, Prisma } from "@prisma/client";

/**
 * Écritures d'une vente au point de vente, signées de son point de vue :
 * positives, l'organisateur lui doit ; négatives, il doit à l'organisateur.
 * Espèces et terminal : il garde l'argent, moins sa commission. Carte en
 * ligne : l'argent va à l'organisateur, qui lui doit la commission.
 */
export async function recordResellerSale(
  tx: Prisma.TransactionClient,
  input: {
    resellerId: string;
    orderId: string;
    reference: string;
    commissionCents: number;
    collectedCents: number;
  },
): Promise<void> {
  const entries: { type: LedgerEntryType; amountCents: number; note: string }[] = [];
  if (input.commissionCents > 0) {
    entries.push({
      type: "COMMISSION_EARNED",
      amountCents: input.commissionCents,
      note: `Commission sur ${input.reference}`,
    });
  }
  if (input.collectedCents > 0) {
    entries.push({
      type: "CASH_COLLECTED",
      amountCents: -input.collectedCents,
      note: `Encaissé au point de vente : ${input.reference}`,
    });
  }
  if (entries.length === 0) return;
  await tx.resellerLedgerEntry.createMany({
    data: entries.map((e) => ({ ...e, resellerId: input.resellerId, orderId: input.orderId })),
  });
}
