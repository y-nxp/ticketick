import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashHoldToken } from "./create-order";

/**
 * Qui modifie une commande côté client : le porteur d'un lien envoyé par
 * l'organisateur, ou la personne connectée à qui la commande appartient.
 */
export type ChangeAccess = { token: string } | { userId: string; orderId: string };

export interface OrderAccess {
  orderId: string;
  linkId: string | null;
  /** Auteur des règlements ouverts : l'organisateur du lien, ou le client. */
  actorId: string | null;
  expiresAt: Date | null;
  viaAccount: boolean;
}

export const eventRulesSelect = {
  selfChange: true,
  changeUntilHours: true,
  selfCancelFree: true,
  cancelUntilHours: true,
} as const;

export async function resolveAccess(
  access: ChangeAccess,
): Promise<{ ok: true; access: OrderAccess } | { ok: false; error: "notFound" | "expired"; orderId?: string }> {
  if ("token" in access) {
    if (!access.token || access.token.length > 100) return { ok: false, error: "notFound" };
    const link = await prisma.orderChangeLink.findUnique({
      where: { tokenHash: hashHoldToken(access.token) },
      select: { id: true, orderId: true, expiresAt: true, createdById: true },
    });
    if (!link) return { ok: false, error: "notFound" };
    if (link.expiresAt <= new Date()) return { ok: false, error: "expired", orderId: link.orderId };
    return {
      ok: true,
      access: {
        orderId: link.orderId,
        linkId: link.id,
        actorId: link.createdById,
        expiresAt: link.expiresAt,
        viaAccount: false,
      },
    };
  }
  if (!access.orderId || !access.userId) return { ok: false, error: "notFound" };
  const order = await prisma.order.findFirst({
    where: { id: access.orderId, userId: access.userId },
    select: { id: true },
  });
  if (!order) return { ok: false, error: "notFound" };
  return {
    ok: true,
    access: {
      orderId: order.id,
      linkId: null,
      actorId: access.userId,
      expiresAt: null,
      viaAccount: true,
    },
  };
}

/** Trace du dernier changement fait par un lien ; le lien reste ouvert jusqu'à son échéance. */
export async function markLinkUsed(
  tx: Prisma.TransactionClient,
  linkId: string | null,
): Promise<void> {
  if (!linkId) return;
  await tx.orderChangeLink.update({ where: { id: linkId }, data: { usedAt: new Date() } });
}
