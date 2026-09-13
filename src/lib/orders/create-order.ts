import "server-only";

import { randomBytes } from "node:crypto";
import { Prisma, type PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { inheritPayment, intersectOffers } from "./payment-methods";

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
  /** Slug du spectacle, pour étiqueter l'encaissement chez l'organisateur. */
  project: string;
  /** Nom affiché sur la page PostFinance (ex. Chœur Cantabile). */
  organizerName: string;
}

export type OrderError =
  | "empty"
  | "unknown_ticket_type"
  | "not_on_sale"
  | "sales_closed"
  | "max_per_order"
  | "companion_limit"
  | "companion_requires_paid"
  | "sold_out"
  | "method_not_allowed"
  | "reference_collision";

/**
 * L'encaissement carte va sur le compte PostFinance de l'organisateur.
 * ticketick ne prélève rien ici : la facturation des organisateurs passe
 * par Stripe, à part.
 */
const PLATFORM_FEE_BPS = 0;

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
      maxPerPaidTicket: true,
      salesStartAt: true,
      salesEndAt: true,
      session: {
        select: {
          id: true,
          status: true,
          startsAt: true,
          capacity: true,
          acceptCard: true,
          acceptIban: true,
          event: {
            select: {
              status: true,
              slug: true,
              title: true,
              acceptCard: true,
              acceptIban: true,
              organizer: { select: { name: true, slug: true } },
            },
          },
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

  // Places gratuites plafonnées par les billets payants de la même séance :
  // sans cela on pourrait emporter uniquement des places à 0 fr.
  const parSeance = new Map<
    string,
    { payants: number; accompagnants: { id: string; n: number; ratio: number }[] }
  >();
  const siegesParSeance = new Map<string, number>();
  for (const [ticketTypeId, quantity] of merged) {
    const tt = byId.get(ticketTypeId)!;
    const sid = tt.session.id;
    siegesParSeance.set(sid, (siegesParSeance.get(sid) ?? 0) + quantity);
    const groupe = parSeance.get(sid) ?? { payants: 0, accompagnants: [] };
    if (tt.maxPerPaidTicket != null) {
      groupe.accompagnants.push({
        id: ticketTypeId,
        n: quantity,
        ratio: tt.maxPerPaidTicket,
      });
    } else if (tt.priceCents > 0) {
      groupe.payants += quantity;
    }
    parSeance.set(sid, groupe);
  }
  for (const groupe of parSeance.values()) {
    for (const acc of groupe.accompagnants) {
      if (groupe.payants === 0) {
        return { ok: false, error: "companion_requires_paid", ticketTypeId: acc.id };
      }
      if (acc.n > groupe.payants * acc.ratio) {
        return { ok: false, error: "companion_limit", ticketTypeId: acc.id };
      }
    }
  }

  const paiement = intersectOffers(
    ticketTypes.map((tt) => inheritPayment(tt.session.event, tt.session)),
  );
  if (
    (input.paymentMethod === "CARD" && !paiement.card) ||
    (input.paymentMethod === "IBAN" && !paiement.iban)
  ) {
    return { ok: false, error: "method_not_allowed" };
  }

  const lines = [...merged].map(([ticketTypeId, quantity]) => {
    const tt = byId.get(ticketTypeId)!;
    return {
      ticketTypeId,
      quantity,
      unitPriceCents: tt.priceCents,
      label: paymentLineLabel({
        organizer: tt.session.event.organizer.name,
        eventTitle: readTitle(tt.session.event.title, input.locale),
        sessionStartsAt: tt.session.startsAt,
        ticketName: readTitle(tt.name, input.locale),
        locale: input.locale,
      }),
    };
  });

  const subtotalCents = lines.reduce(
    (sum, l) => sum + l.unitPriceCents * l.quantity,
    0,
  );
  const feeCents = Math.round((subtotalCents * PLATFORM_FEE_BPS) / 10_000);
  const totalCents = subtotalCents + feeCents;
  const currency = byId.get(lines[0]!.ticketTypeId)!.currency;
  const project = [
    ...new Set(ticketTypes.map((tt) => tt.session.event.slug)),
  ].join("+");
  const organizerName = ticketTypes[0]?.session.event.organizer.name.trim() ?? "";

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

      for (const [sessionId, n] of siegesParSeance) {
        const tt = ticketTypes.find((x) => x.session.id === sessionId);
        if (!tt) continue;
        if (tt.session.capacity == null) {
          await tx.eventSession.update({
            where: { id: sessionId },
            data: { sold: { increment: n } },
          });
          continue;
        }
        const jauge = await tx.$executeRaw`
          UPDATE "EventSession"
          SET sold = sold + ${n}
          WHERE id = ${sessionId}
            AND sold + ${n} <= capacity
        `;
        if (jauge !== 1) {
          throw new SoldOutError(tt.id);
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
        project,
        organizerName,
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
/**
 * Rend le stock des paiements carte qui n'ont jamais abouti.
 *
 * - sans ligne Payment : PostFinance n'a pas été joignable — 2 minutes suffisent
 * - Payment encore PENDING : l'acheteur a pu être envoyé chez PF — 60 minutes
 */
export async function releaseStaleUnpaidCardOrders(): Promise<number> {
  const sansEncaissement = new Date(Date.now() - 2 * 60 * 1000);
  const encaissementEnCours = new Date(Date.now() - 60 * 60 * 1000);

  const stale = await prisma.order.findMany({
    where: {
      status: "AWAITING_PAYMENT",
      paymentMethod: "CARD",
      OR: [
        { payment: { is: null }, createdAt: { lt: sansEncaissement } },
        {
          payment: { is: { status: "PENDING" } },
          createdAt: { lt: encaissementEnCours },
        },
      ],
    },
    select: { id: true },
    take: 50,
  });

  for (const order of stale) {
    await releaseOrder(order.id).catch((error) => {
      console.error("[checkout] libération commande périmée", order.id, error);
    });
  }
  return stale.length;
}

export async function releaseOrder(orderId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        status: true,
        items: {
          select: {
            quantity: true,
            ticketType: { select: { id: true, sessionId: true } },
          },
        },
      },
    });

    // Une commande déjà payée ou déjà annulée ne doit pas voir son stock
    // rendu : le faire deux fois recréerait des places inexistantes.
    if (!order || order.status === "PAID" || order.status === "CANCELLED") {
      return;
    }

    const sieges = new Map<string, number>();
    for (const item of order.items) {
      await tx.$executeRaw`
        UPDATE "TicketType"
        SET sold = GREATEST(sold - ${item.quantity}, 0)
        WHERE id = ${item.ticketType.id}
      `;
      const sid = item.ticketType.sessionId;
      sieges.set(sid, (sieges.get(sid) ?? 0) + item.quantity);
    }
    for (const [sessionId, n] of sieges) {
      await tx.$executeRaw`
        UPDATE "EventSession"
        SET sold = GREATEST(sold - ${n}, 0)
        WHERE id = ${sessionId}
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

function paymentLineLabel(input: {
  organizer: string;
  eventTitle: string;
  sessionStartsAt: Date;
  ticketName: string;
  locale: string;
}): string {
  const date = new Intl.DateTimeFormat(dateLocale(input.locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Zurich",
  }).format(input.sessionStartsAt);
  return [input.organizer, input.eventTitle, date, input.ticketName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" — ")
    .slice(0, 150);
}

function dateLocale(locale: string): string {
  switch (locale) {
    case "de":
      return "de-CH";
    case "it":
      return "it-CH";
    case "en":
      return "en-CH";
    default:
      return "fr-CH";
  }
}

function readTitle(value: unknown, locale: string): string {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const hit = record[locale] ?? record.fr ?? Object.values(record)[0];
    if (typeof hit === "string") return hit;
  }
  return "";
}
