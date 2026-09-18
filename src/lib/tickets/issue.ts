import "server-only";

import { randomBytes } from "node:crypto";
import { Prisma, type TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type TicketLine = { ticketTypeId: string; quantity: number };

/**
 * Code de billet imprévisible.
 *
 * Sert de preuve à l'entrée : une numérotation devinable permettrait de
 * fabriquer un billet valable sans l'avoir acheté.
 */
export function generateTicketCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) out += alphabet[bytes[i]! % alphabet.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
}

/** Crée les billets manquants d'une commande, sans toucher à ceux déjà émis. */
export async function issueMissingTickets(
  tx: Prisma.TransactionClient,
  order: { id: string; items: TicketLine[] },
  status: TicketStatus,
): Promise<string[]> {
  const existing = await tx.ticket.findMany({
    where: { orderId: order.id },
    select: { ticketTypeId: true },
  });
  const already = new Map<string, number>();
  for (const ticket of existing) {
    already.set(ticket.ticketTypeId, (already.get(ticket.ticketTypeId) ?? 0) + 1);
  }

  const codes: string[] = [];
  for (const item of order.items) {
    const have = already.get(item.ticketTypeId) ?? 0;
    for (let i = have; i < item.quantity; i++) {
      const code = generateTicketCode();
      codes.push(code);
      await tx.ticket.create({
        data: {
          code,
          orderId: order.id,
          ticketTypeId: item.ticketTypeId,
          status,
        },
      });
    }
  }
  return codes;
}

/** Passe les billets encore en attente à VALID, une fois le paiement reçu. */
export async function activateOrderTickets(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<string[]> {
  await tx.ticket.updateMany({
    where: { orderId, status: "PENDING" },
    data: { status: "VALID" },
  });
  const tickets = await tx.ticket.findMany({
    where: { orderId, status: { in: ["VALID", "USED"] } },
    select: { code: true },
  });
  return tickets.map((ticket) => ticket.code);
}

export async function cancelOrderTickets(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  await tx.ticket.updateMany({
    where: { orderId, status: { not: "USED" } },
    data: { status: "CANCELLED" },
  });
}

/**
 * Émet les billets d'une commande encore ouverte, pour un téléchargement
 * backoffice. Les commandes annulées ou remboursées ne créent rien.
 */
export async function ensureTicketsForReference(
  reference: string,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { reference },
      select: {
        id: true,
        status: true,
        items: { select: { ticketTypeId: true, quantity: true } },
        _count: { select: { tickets: true } },
      },
    });
    if (!order) return false;
    if (order.status === "CANCELLED" || order.status === "REFUNDED") {
      return order._count.tickets > 0;
    }
    await issueMissingTickets(
      tx,
      order,
      order.status === "PAID" ? "VALID" : "PENDING",
    );
    return true;
  });
}
