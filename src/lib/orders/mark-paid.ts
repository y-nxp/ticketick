import "server-only";

import type { OrderStatus, PaymentMethod, Prisma } from "@prisma/client";
import { sendRefundAlertEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { activateOrderTickets, issueMissingTickets } from "@/lib/tickets/issue";

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
  | { ok: false; error: "unknown_order" | "amount_mismatch" | "order_closed" }
  | { ok: false; error: "seats_gone"; orderId: string };

class SeatsGone extends Error {
  constructor(readonly orderId: string) {
    super("seats_gone");
  }
}

export async function markOrderPaid(
  input: MarkPaidInput,
): Promise<MarkPaidResult> {
  try {
    return await prisma.$transaction((tx) => settle(tx, input));
  } catch (error) {
    if (!(error instanceof SeatsGone)) throw error;
    // L'argent est arrivé mais les places sont reparties : la commande reste
    // annulée, et le paiement enregistré la signale comme à rembourser.
    await prisma.$transaction((tx) =>
      recordPayment(tx, error.orderId, input),
    );
    console.error(
      `[paiement] ${input.reference} payée après libération, places revendues : à rembourser`,
      { provider: input.provider, providerRef: input.providerRef },
    );
    await sendRefundAlertEmail(input);
    return { ok: false, error: "seats_gone", orderId: error.orderId };
  }
}

async function settle(
  tx: Prisma.TransactionClient,
  input: MarkPaidInput,
): Promise<MarkPaidResult> {
  // Verrou sur la commande : la libération des rétentions expirées attend la
  // fin de cette transaction, puis voit PAID et n'y touche plus. Sans lui,
  // les deux pourraient se croiser et laisser une commande payée sans place.
  const [locked] = await tx.$queryRaw<{ id: string; status: OrderStatus }[]>`
    SELECT id, status FROM "Order"
    WHERE reference = ${input.reference}
    FOR UPDATE
  `;
  if (!locked) return { ok: false, error: "unknown_order" };

  const order = await tx.order.findUniqueOrThrow({
    where: { id: locked.id },
    select: {
      id: true,
      status: true,
      totalCents: true,
      resellerId: true,
      commissionCents: true,
      items: {
        select: {
          ticketTypeId: true,
          quantity: true,
          ticketType: {
            select: {
              sessionId: true,
              session: { select: { capacity: true } },
            },
          },
        },
      },
      tickets: { select: { code: true } },
      payment: { select: { status: true } },
    },
  });

  if (order.status === "PAID") {
    return {
      ok: true,
      alreadyPaid: true,
      orderId: order.id,
      ticketCodes: order.tickets.map((t) => t.code),
    };
  }

  if (order.status === "REFUNDED") return { ok: false, error: "order_closed" };

  // Un montant encaissé différent du montant attendu ne doit pas valider la
  // commande en silence : mieux vaut la laisser en attente et l'examiner.
  if (input.amountCents !== order.totalCents) {
    return { ok: false, error: "amount_mismatch" };
  }

  // Paiement arrivé après la libération de la rétention (retour tardif de
  // PostFinance) : le stock a été rendu, il faut le reprendre avant d'émettre.
  // Déjà signalée à rembourser : le webhook rejoué ne doit ni réessayer ni
  // renvoyer l'alerte.
  if (order.status === "CANCELLED") {
    if (order.payment?.status === "COMPLETED") {
      return { ok: false, error: "seats_gone", orderId: order.id };
    }
    await reclaimSeats(tx, order);
  }

  // Le stock a déjà été réservé à la création de la commande. Les billets
  // peuvent déjà exister en PENDING (tentative) : on les active, on ne les
  // recrée pas.
  await issueMissingTickets(tx, order, "VALID");
  const ticketCodes = await activateOrderTickets(tx, order.id);

  await recordPayment(tx, order.id, input);

  await tx.order.update({
    where: { id: order.id },
    data: { status: "PAID", paymentMethod: input.method },
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

  return { ok: true, alreadyPaid: false, orderId: order.id, ticketCodes };
}

/** Reprend les places d'une commande annulée, aux mêmes conditions qu'à l'achat. */
async function reclaimSeats(
  tx: Prisma.TransactionClient,
  order: {
    id: string;
    items: {
      ticketTypeId: string;
      quantity: number;
      ticketType: { sessionId: string; session: { capacity: number | null } };
    }[];
  },
): Promise<void> {
  const seances = new Map<string, { n: number; capacity: number | null }>();
  for (const item of order.items) {
    const reserved = await tx.$executeRaw`
      UPDATE "TicketType"
      SET sold = sold + ${item.quantity}
      WHERE id = ${item.ticketTypeId}
        AND sold + ${item.quantity} <= quantity
    `;
    if (reserved !== 1) throw new SeatsGone(order.id);
    const { sessionId, session } = item.ticketType;
    const prev = seances.get(sessionId);
    seances.set(sessionId, {
      n: (prev?.n ?? 0) + item.quantity,
      capacity: session.capacity,
    });
  }

  for (const [sessionId, { n, capacity }] of seances) {
    const reserved =
      capacity == null
        ? await tx.$executeRaw`
            UPDATE "EventSession" SET sold = sold + ${n} WHERE id = ${sessionId}
          `
        : await tx.$executeRaw`
            UPDATE "EventSession"
            SET sold = sold + ${n}
            WHERE id = ${sessionId}
              AND sold + ${n} <= capacity
          `;
    if (reserved !== 1) throw new SeatsGone(order.id);
  }

  await tx.ticket.updateMany({
    where: { orderId: order.id, status: "CANCELLED" },
    data: { status: "PENDING" },
  });
}

async function recordPayment(
  tx: Prisma.TransactionClient,
  orderId: string,
  input: MarkPaidInput,
): Promise<void> {
  await tx.payment.upsert({
    where: { orderId },
    create: {
      orderId,
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
      method: input.method,
      provider: input.provider,
    },
  });
}
