import "server-only";

import { randomBytes } from "node:crypto";
import { Prisma, type PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Création d'une commande.
 *
 * Le client n'envoie que des identifiants de tarif et des quantités. Les prix
 * sont relus en base : les accepter depuis la requête laisserait n'importe qui
 * fixer le montant à payer.
 */

export interface OrderLineInput {
  ticketTypeId: string;
  quantity: number;
}

export interface CreateOrderInput {
  lines: OrderLineInput[];
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  locale: string;
  paymentMethod: PaymentMethod;
  userId?: string;
  resellerId?: string;
  soldByUserId?: string;
}

export type CreateOrderResult =
  | { ok: true; order: CreatedOrder }
  | { ok: false; error: OrderError; ticketTypeId?: string };

export interface CreatedOrder {
  id: string;
  reference: string;
  subtotalCents: number;
  feeCents: number;
  totalCents: number;
  currency: string;
  lines: {
    ticketTypeId: string;
    quantity: number;
    unitPriceCents: number;
    label: string;
  }[];
}

export type OrderError =
  | "empty"
  | "unknown_ticket_type"
  | "not_on_sale"
  | "sales_closed"
  | "max_per_order"
  | "sold_out"
  | "reference_collision";

/** Commission de la plateforme, en points de base (500 = 5 %). */
const PLATFORM_FEE_BPS = 500;

export async function createOrder(
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  if (input.lines.length === 0) return { ok: false, error: "empty" };

  // Un même tarif peut arriver en plusieurs lignes depuis le panier : les
  // fusionner évite de contrôler le stock deux fois par petits morceaux et de
  // laisser passer un total supérieur à ce qui reste.
  const merged = new Map<string, number>();
  for (const line of input.lines) {
    merged.set(
      line.ticketTypeId,
      (merged.get(line.ticketTypeId) ?? 0) + line.quantity,
    );
  }

  const ticketTypes = await prisma.ticketType.findMany({
    where: { id: { in: [...merged.keys()] } },
    select: {
      id: true,
      name: true,
      priceCents: true,
      currency: true,
      quantity: true,
      sold: true,
      maxPerOrder: true,
      salesStartAt: true,
      salesEndAt: true,
      session: {
        select: {
          status: true,
          startsAt: true,
          event: { select: { status: true, title: true } },
        },
      },
    },
  });

  const byId = new Map(ticketTypes.map((tt) => [tt.id, tt]));
  const now = new Date();

  for (const [ticketTypeId, quantity] of merged) {
    const tt = byId.get(ticketTypeId);
    if (!tt) return { ok: false, error: "unknown_ticket_type", ticketTypeId };

    if (tt.session.event.status !== "PUBLISHED" || tt.session.status !== "PUBLISHED") {
      return { ok: false, error: "not_on_sale", ticketTypeId };
    }

    // Une séance passée ne peut plus être vendue même si la fenêtre de vente
    // n'a pas été renseignée.
    if (tt.session.startsAt <= now) {
      return { ok: false, error: "sales_closed", ticketTypeId };
    }
    if (tt.salesStartAt && tt.salesStartAt > now) {
      return { ok: false, error: "not_on_sale", ticketTypeId };
    }
    if (tt.salesEndAt && tt.salesEndAt < now) {
      return { ok: false, error: "sales_closed", ticketTypeId };
    }

    if (quantity > tt.maxPerOrder) {
      return { ok: false, error: "max_per_order", ticketTypeId };
    }
    // Contrôle indicatif : le stock fait l'objet d'une réservation atomique
    // plus bas, seule capable de départager deux acheteurs simultanés.
    if (tt.sold + quantity > tt.quantity) {
      return { ok: false, error: "sold_out", ticketTypeId };
    }
  }

  const lines = [...merged].map(([ticketTypeId, quantity]) => {
    const tt = byId.get(ticketTypeId)!;
    return {
      ticketTypeId,
      quantity,
      unitPriceCents: tt.priceCents,
      label: `${readTitle(tt.session.event.title, input.locale)} — ${readTitle(tt.name, input.locale)}`,
    };
  });

  const subtotalCents = lines.reduce(
    (sum, l) => sum + l.unitPriceCents * l.quantity,
    0,
  );
  const feeCents = Math.round((subtotalCents * PLATFORM_FEE_BPS) / 10_000);
  const totalCents = subtotalCents + feeCents;
  const currency = byId.get(lines[0]!.ticketTypeId)!.currency;

  try {
    const order = await prisma.$transaction(async (tx) => {
      for (const line of lines) {
        // Réservation en une seule instruction : la condition et l'incrément
        // sont évalués par la base, ce qui interdit à deux commandes
        // concurrentes de dépasser le stock. Une lecture suivie d'une
        // écriture laisserait au contraire passer les deux.
        const reserved = await tx.$executeRaw`
          UPDATE "TicketType"
          SET sold = sold + ${line.quantity}
          WHERE id = ${line.ticketTypeId}
            AND sold + ${line.quantity} <= quantity
        `;
        if (reserved !== 1) {
          throw new SoldOutError(line.ticketTypeId);
        }
      }

      return tx.order.create({
        data: {
          reference: generateReference(),
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          locale: input.locale,
          status: "AWAITING_PAYMENT",
          paymentMethod: input.paymentMethod,
          channel: input.resellerId ? "RESELLER" : "ONLINE",
          resellerId: input.resellerId,
          soldByUserId: input.soldByUserId,
          userId: input.userId,
          subtotalCents,
          feeCents,
          totalCents,
          currency,
          items: {
            create: lines.map((l) => ({
              ticketTypeId: l.ticketTypeId,
              quantity: l.quantity,
              unitPriceCents: l.unitPriceCents,
            })),
          },
        },
        select: { id: true, reference: true },
      });
    });

    return {
      ok: true,
      order: {
        id: order.id,
        reference: order.reference,
        subtotalCents,
        feeCents,
        totalCents,
        currency,
        lines,
      },
    };
  } catch (error) {
    if (error instanceof SoldOutError) {
      return { ok: false, error: "sold_out", ticketTypeId: error.ticketTypeId };
    }
    // P2002 : la référence tirée au hasard existait déjà. L'appelant peut
    // réessayer, la transaction ayant tout annulé, stock compris.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, error: "reference_collision" };
    }
    throw error;
  }
}

/**
 * Rend le stock d'une commande qui n'aboutira pas.
 *
 * Sans cela, un panier abandonné retiendrait des places jusqu'à la date de la
 * séance.
 */
export async function releaseOrder(orderId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        status: true,
        items: { select: { ticketTypeId: true, quantity: true } },
      },
    });

    // Une commande déjà payée ou déjà annulée ne doit pas voir son stock
    // rendu : le faire deux fois recréerait des places inexistantes.
    if (!order || order.status === "PAID" || order.status === "CANCELLED") {
      return;
    }

    for (const item of order.items) {
      await tx.$executeRaw`
        UPDATE "TicketType"
        SET sold = GREATEST(sold - ${item.quantity}, 0)
        WHERE id = ${item.ticketTypeId}
      `;
    }

    await tx.order.update({
      where: { id: orderId },
      data: { status: "CANCELLED" },
    });
  });
}

class SoldOutError extends Error {
  constructor(readonly ticketTypeId: string) {
    super(`Stock insuffisant pour ${ticketTypeId}`);
  }
}

/**
 * Référence lisible et imprévisible.
 *
 * Le tirage porte sur 40 bits : une suite de six chiffres décimaux, comme
 * auparavant, entrait en collision dès le millier de commandes.
 */
function generateReference(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sans I, L, O, 0, 1
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return `TT-${out.slice(0, 4)}-${out.slice(4)}`;
}

function readTitle(value: unknown, locale: string): string {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const hit = record[locale] ?? record.fr ?? Object.values(record)[0];
    if (typeof hit === "string") return hit;
  }
  return "";
}
