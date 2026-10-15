import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashHoldToken } from "./create-order";

/**
 * Qui modifie une commande côté client : le porteur d'un lien envoyé par
 * l'organisateur, ou la personne connectée à qui la commande appartient.
 * Quand la commande a un compte, le lien ne suffit plus : il faut aussi être
 * connecté à ce compte (`userId`).
 */
export type ChangeAccess =
  | { token: string; userId?: string | null }
  | { userId: string; orderId: string };

export interface OrderAccess {
  orderId: string;
  linkId: string | null;
  /** Auteur des règlements ouverts : l'organisateur du lien, ou le client. */
  actorId: string | null;
  expiresAt: Date | null;
  viaAccount: boolean;
}

export type AccessError = "notFound" | "expired" | "accountRequired";

export const eventRulesSelect = {
  selfChange: true,
  changeUntilHours: true,
  selfCancelFree: true,
  cancelUntilHours: true,
} as const;

/**
 * Compte du client : celui de la commande, ou à défaut un compte dont
 * l'adresse, confirmée, est celle de la commande (achat fait sans être
 * connecté).
 */
async function orderOwner(orderId: string): Promise<{ id: string; attached: boolean } | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { userId: true, email: true },
  });
  if (!order) return null;
  if (order.userId) return { id: order.userId, attached: true };
  const email = order.email.trim();
  if (!email) return null;
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, emailVerifiedAt: { not: null } },
    select: { id: true },
  });
  return user ? { id: user.id, attached: false } : null;
}

/** La commande rejoint le compte du client, une fois connecté. */
async function attachOrder(orderId: string, userId: string): Promise<void> {
  await prisma.order.updateMany({ where: { id: orderId, userId: null }, data: { userId } });
}

/** Le client du lien a-t-il un compte ? (pour l'inviter à se connecter ou à en créer un) */
export async function orderHasAccount(orderId: string): Promise<boolean> {
  return (await orderOwner(orderId)) != null;
}

export async function resolveAccess(
  access: ChangeAccess,
): Promise<{ ok: true; access: OrderAccess } | { ok: false; error: AccessError; orderId?: string }> {
  if ("token" in access) {
    if (!access.token || access.token.length > 100) return { ok: false, error: "notFound" };
    const link = await prisma.orderChangeLink.findUnique({
      where: { tokenHash: hashHoldToken(access.token) },
      select: { id: true, orderId: true, expiresAt: true, createdById: true },
    });
    if (!link) return { ok: false, error: "notFound" };
    if (link.expiresAt <= new Date()) return { ok: false, error: "expired", orderId: link.orderId };
    const owner = await orderOwner(link.orderId);
    if (owner) {
      if (owner.id !== access.userId) {
        return { ok: false, error: "accountRequired", orderId: link.orderId };
      }
      if (!owner.attached) await attachOrder(link.orderId, owner.id);
    }
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
  const owner = await orderOwner(access.orderId);
  if (owner?.id !== access.userId) return { ok: false, error: "notFound" };
  if (!owner.attached) await attachOrder(access.orderId, owner.id);
  return {
    ok: true,
    access: {
      orderId: access.orderId,
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
