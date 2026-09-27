import "server-only";

import { randomBytes } from "node:crypto";
import { Prisma, type TicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readLayout, seatLabel } from "@/lib/seating/layout";

type TicketLine = {
  ticketTypeId: string;
  quantity: number;
  /** Séance numérotée : un siège par billet, dans l'ordre d'émission. */
  seatKeys?: string[];
};

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

  const labels = await seatLabelsFor(tx, order);

  const codes: string[] = [];
  for (const item of order.items) {
    const have = already.get(item.ticketTypeId) ?? 0;
    for (let i = have; i < item.quantity; i++) {
      const code = generateTicketCode();
      codes.push(code);
      const seatKey = item.seatKeys?.[i];
      await tx.ticket.create({
        data: {
          code,
          orderId: order.id,
          ticketTypeId: item.ticketTypeId,
          status,
          seatKey: seatKey ?? null,
          seatLabel: seatKey ? (labels.get(seatKey) ?? seatKey) : null,
        },
      });
    }
  }
  return codes;
}

/** Libellés des sièges de la commande, dans la langue de l'acheteur. */
async function seatLabelsFor(
  tx: Prisma.TransactionClient,
  order: { id: string; items: TicketLine[] },
): Promise<Map<string, string>> {
  const seated = order.items.filter((i) => i.seatKeys?.length);
  const out = new Map<string, string>();
  if (seated.length === 0) return out;

  const [row, types] = await Promise.all([
    tx.order.findUnique({ where: { id: order.id }, select: { locale: true } }),
    tx.ticketType.findMany({
      where: { id: { in: seated.map((i) => i.ticketTypeId) } },
      select: { id: true, session: { select: { seatPlan: { select: { layout: true } } } } },
    }),
  ]);
  const locale = row?.locale ?? "fr";
  for (const item of seated) {
    const layout = readLayout(
      types.find((t) => t.id === item.ticketTypeId)?.session.seatPlan?.layout,
    );
    if (!layout) continue;
    for (const key of item.seatKeys!) out.set(key, seatLabel(layout, key, locale));
  }
  return out;
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
        items: { select: { ticketTypeId: true, quantity: true, seatKeys: true } },
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
