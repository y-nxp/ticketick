import "server-only";

import { randomBytes } from "node:crypto";
import type { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Confirmation du paiement d'une commande.
 *
 * Idempotente : Stripe rejoue un même événement en cas de doute sur la
 * réception, et une seconde exécution ne doit ni créer de billets en double
 * ni fausser la comptabilité.
 */

export interface MarkPaidInput {
  reference: string;
  provider: string;
  providerRef?: string;
  method: PaymentMethod;
  amountCents: number;
  currency: string;
}

export type MarkPaidResult =
  | { ok: true; alreadyPaid: boolean; orderId: string; ticketCodes: string[] }
  | { ok: false; error: "unknown_order" | "amount_mismatch" };

export async function markOrderPaid(
  input: MarkPaidInput,
): Promise<MarkPaidResult> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { reference: input.reference },
      select: {
        id: true,
        status: true,
        totalCents: true,
        resellerId: true,
        commissionCents: true,
        items: { select: { ticketTypeId: true, quantity: true } },
        tickets: { select: { code: true } },
      },
    });

    if (!order) return { ok: false as const, error: "unknown_order" as const };

    if (order.status === "PAID") {
      return {
        ok: true as const,
        alreadyPaid: true,
        orderId: order.id,
        ticketCodes: order.tickets.map((t) => t.code),
      };
    }

    // Un montant encaissé différent du montant attendu ne doit pas valider la
    // commande en silence : mieux vaut la laisser en attente et l'examiner.
    if (input.amountCents !== order.totalCents) {
      return { ok: false as const, error: "amount_mismatch" as const };
    }

    // Le stock a déjà été réservé à la création de la commande : il ne faut
    // surtout pas l'incrémenter une seconde fois ici.
    const ticketCodes: string[] = [];
    for (const item of order.items) {
      for (let i = 0; i < item.quantity; i++) {
        const code = generateTicketCode();
        ticketCodes.push(code);
        await tx.ticket.create({
          data: {
            code,
            orderId: order.id,
            ticketTypeId: item.ticketTypeId,
            status: "VALID",
          },
        });
      }
    }

    await tx.payment.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        provider: input.provider,
        providerRef: input.providerRef,
        method: input.method,
        status: "COMPLETED",
        amountCents: input.amountCents,
        currency: input.currency,
      },
      update: {
        status: "COMPLETED",
        providerRef: input.providerRef,
      },
    });

    await tx.order.update({
      where: { id: order.id },
      data: { status: "PAID" },
    });

    // Vente par un point de vente : la commission lui est due, donc portée au
    // crédit de son registre. Le signe suit la convention du modèle, positif
    // signifiant que ticketick doit de l'argent au revendeur.
    if (order.resellerId && order.commissionCents > 0) {
      await tx.resellerLedgerEntry.create({
        data: {
          resellerId: order.resellerId,
          orderId: order.id,
          type: "COMMISSION_EARNED",
          amountCents: order.commissionCents,
          note: `Commission sur ${input.reference}`,
        },
      });
    }

    return {
      ok: true as const,
      alreadyPaid: false,
      orderId: order.id,
      ticketCodes,
    };
  });
}

/**
 * Code de billet imprévisible.
 *
 * Sert de preuve à l'entrée : une numérotation devinable permettrait de
 * fabriquer un billet valable sans l'avoir acheté.
 */
function generateTicketCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) out += alphabet[bytes[i]! % alphabet.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
}
