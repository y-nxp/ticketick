import "server-only";

import { randomBytes } from "node:crypto";
import { Prisma, type PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cancelOrderTickets, issueMissingTickets } from "@/lib/tickets/issue";
import { EVENT_TIME_ZONE } from "@/lib/utils";
import { inheritPayment, intersectOffers } from "./payment-methods";
import {
  resolveOrderOptions,
  type OptionSelectionInput,
  type ResolvedOption,
} from "./options";
import { CARD_HOLD_MS } from "./reservation";

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
  options?: OptionSelectionInput[];
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
  createdAt: Date;
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
  | "reference_collision"
  | "hold_expired"
  | "hold_mismatch"
  | "option_unavailable"
  | "option_incomplete"
  | "option_invalid";

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
      companionOfId: true,
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
              organizer: { select: { id: true, name: true, slug: true } },
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
    {
      payants: number;
      accompagnants: {
        id: string;
        n: number;
        ratio: number;
        sourceId: string | null;
      }[];
    }
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
        sourceId: tt.companionOfId,
      });
    } else if (tt.priceCents > 0) {
      groupe.payants += quantity;
    }
    parSeance.set(sid, groupe);
  }
  for (const groupe of parSeance.values()) {
    for (const acc of groupe.accompagnants) {
      // Tarif source désigné : seules ses places comptent, pas les autres
      // zones. Sans source : tous les payants de la séance comptent.
      const payants =
        acc.sourceId == null
          ? groupe.payants
          : (merged.get(acc.sourceId) ?? 0);
      if (payants === 0) {
        return { ok: false, error: "companion_requires_paid", ticketTypeId: acc.id };
      }
      if (acc.n > payants * acc.ratio) {
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

  const sessionIds = [...new Set(ticketTypes.map((tt) => tt.session.id))];
  const options = await resolveOrderOptions({
    sessionIds,
    selections: input.options ?? [],
    locale: input.locale,
  });
  if (!options.ok) return options;

  const ticketSubtotal = lines.reduce(
    (sum, l) => sum + l.unitPriceCents * l.quantity,
    0,
  );
  const optionAmount = options.rows.reduce((sum, r) => sum + r.amountCents, 0);
  const subtotalCents = ticketSubtotal + optionAmount;
  const feeCents = Math.round((subtotalCents * PLATFORM_FEE_BPS) / 10_000);
  const totalCents = subtotalCents + feeCents;
  const paymentLines = [
    ...lines,
    ...options.rows.map(optionPaymentLine),
  ];
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

      const order = await tx.order.create({
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
          options: {
            create: options.rows.map((r) => ({
              optionId: r.optionId,
              title: r.title,
              summary: r.summary,
              quantity: r.quantity,
              unitPriceCents: r.unitPriceCents,
              amountCents: r.amountCents,
            })),
          },
        },
        select: { id: true, reference: true, createdAt: true },
      });

      await issueMissingTickets(
        tx,
        {
          id: order.id,
          items: lines.map((line) => ({
            ticketTypeId: line.ticketTypeId,
            quantity: line.quantity,
          })),
        },
        "PENDING",
      );

      return order;
    });

    if (input.userId) {
      await followIfOptedIn(
        input.userId,
        ticketTypes.map((tt) => tt.session.event.organizer.id),
      );
    }

    return {
      ok: true,
      order: {
        id: order.id,
        reference: order.reference,
        subtotalCents,
        feeCents,
        totalCents,
        currency,
        lines: paymentLines,
        project,
        organizerName,
        createdAt: order.createdAt,
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

/** Nombre de rétentions périmées traitées par appel. */
export const STALE_RELEASE_BATCH = 50;

/**
 * Rend le stock des paiements carte qui n'ont jamais abouti.
 *
 * Au-delà de 25 minutes, les places sont remises en vente. Sans cela, un
 * panier abandonné retiendrait des sièges jusqu'à la séance.
 */
export async function releaseStaleUnpaidCardOrders(): Promise<number> {
  const limite = new Date(Date.now() - CARD_HOLD_MS);

  const stale = await prisma.order.findMany({
    where: {
      status: "AWAITING_PAYMENT",
      paymentMethod: "CARD",
      createdAt: { lt: limite },
    },
    select: { id: true },
    take: STALE_RELEASE_BATCH,
  });

  for (const order of stale) {
    await releaseOrder(order.id).catch((error) => {
      console.error("[checkout] libération commande périmée", order.id, error);
    });
  }
  return stale.length;
}

export async function releaseOrderByReference(
  reference: string,
): Promise<void> {
  const order = await prisma.order.findFirst({
    where: { reference, status: "AWAITING_PAYMENT" },
    select: { id: true },
  });
  if (order) await releaseOrder(order.id);
}

export async function releaseOrder(orderId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // On bascule le statut d'abord : sous READ COMMITTED, une libération
    // concurrente (balayage + requête visiteur) attend ce verrou puis voit
    // CANCELLED et n'a plus rien à rendre. Sans ce garde-fou, le stock
    // serait décrémenté deux fois et créerait des places inexistantes.
    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: { notIn: ["PAID", "CANCELLED"] } },
      data: { status: "CANCELLED" },
    });
    if (claimed.count === 0) return;

    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        items: {
          select: {
            quantity: true,
            ticketType: { select: { id: true, sessionId: true } },
          },
        },
      },
    });

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

    await cancelOrderTickets(tx, orderId);
  });
}

export const HOLD_PLACEHOLDER_DOMAIN = "hold.ticketick.invalid";

export function isCheckoutHoldEmail(email: string): boolean {
  return email.endsWith(`@${HOLD_PLACEHOLDER_DOMAIN}`);
}

/** Retient le stock dès l'arrivée sur le checkout, avant les coordonnées. */
export async function createCheckoutHold(input: {
  lines: OrderLineInput[];
  locale: string;
}): Promise<CreateOrderResult> {
  const token = randomBytes(8).toString("hex");
  return createOrder({
    lines: input.lines,
    email: `hold+${token}@${HOLD_PLACEHOLDER_DOMAIN}`,
    firstName: "—",
    lastName: "—",
    locale: input.locale,
    paymentMethod: "CARD",
  });
}

/**
 * Relie une rétention encore valable aux coordonnées de l'acheteur,
 * sans re-prélever le stock.
 */
export async function fulfillCheckoutHold(
  reference: string,
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  const limite = new Date(Date.now() - CARD_HOLD_MS);
  const order = await prisma.order.findFirst({
    where: {
      reference,
      status: "AWAITING_PAYMENT",
      createdAt: { gt: limite },
    },
    select: {
      id: true,
      reference: true,
      createdAt: true,
      subtotalCents: true,
      feeCents: true,
      totalCents: true,
      currency: true,
      items: {
        select: { ticketTypeId: true, quantity: true, unitPriceCents: true },
      },
    },
  });
  if (!order) return { ok: false, error: "hold_expired" };

  const attendu = new Map<string, number>();
  for (const line of input.lines) {
    attendu.set(
      line.ticketTypeId,
      (attendu.get(line.ticketTypeId) ?? 0) + line.quantity,
    );
  }
  if (order.items.length !== attendu.size) {
    return { ok: false, error: "hold_mismatch" };
  }
  for (const item of order.items) {
    if (attendu.get(item.ticketTypeId) !== item.quantity) {
      return { ok: false, error: "hold_mismatch" };
    }
  }

  const ticketTypes = await prisma.ticketType.findMany({
    where: { id: { in: order.items.map((item) => item.ticketTypeId) } },
    select: {
      id: true,
      name: true,
      session: {
        select: {
          id: true,
          startsAt: true,
          event: {
            select: {
              slug: true,
              title: true,
              organizer: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  const options = await resolveOrderOptions({
    sessionIds: [...new Set(ticketTypes.map((tt) => tt.session.id))],
    selections: input.options ?? [],
    locale: input.locale,
  });
  if (!options.ok) return options;

  const ticketSubtotal = order.items.reduce(
    (sum, item) => sum + item.unitPriceCents * item.quantity,
    0,
  );
  const optionAmount = options.rows.reduce((sum, r) => sum + r.amountCents, 0);
  const subtotalCents = ticketSubtotal + optionAmount;
  const feeCents = Math.round((subtotalCents * PLATFORM_FEE_BPS) / 10_000);
  const totalCents = subtotalCents + feeCents;

  await prisma.$transaction(async (tx) => {
    await tx.orderOption.deleteMany({ where: { orderId: order.id } });
    await tx.order.update({
      where: { id: order.id },
      data: {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        locale: input.locale,
        paymentMethod: input.paymentMethod,
        userId: input.userId,
        subtotalCents,
        feeCents,
        totalCents,
        options: {
          create: options.rows.map((r) => ({
            optionId: r.optionId,
            title: r.title,
            summary: r.summary,
            quantity: r.quantity,
            unitPriceCents: r.unitPriceCents,
            amountCents: r.amountCents,
          })),
        },
      },
    });
    await issueMissingTickets(tx, order, "PENDING");
  });

  const byId = new Map(ticketTypes.map((tt) => [tt.id, tt]));
  const lines = [
    ...order.items.map((item) => {
      const tt = byId.get(item.ticketTypeId);
      return {
        ticketTypeId: item.ticketTypeId,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        label: tt
          ? paymentLineLabel({
              organizer: tt.session.event.organizer.name,
              eventTitle: readTitle(tt.session.event.title, input.locale),
              sessionStartsAt: tt.session.startsAt,
              ticketName: readTitle(tt.name, input.locale),
              locale: input.locale,
            })
          : item.ticketTypeId,
      };
    }),
    ...options.rows.map(optionPaymentLine),
  ];

  return {
    ok: true,
    order: {
      id: order.id,
      reference: order.reference,
      subtotalCents,
      feeCents,
      totalCents,
      currency: order.currency,
      lines,
      project: [
        ...new Set(ticketTypes.map((tt) => tt.session.event.slug)),
      ].join("+"),
      organizerName: ticketTypes[0]?.session.event.organizer.name.trim() ?? "",
      createdAt: order.createdAt,
    },
  };
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

async function followIfOptedIn(userId: string, organizerIds: string[]) {
  const buyer = await prisma.user.findUnique({
    where: { id: userId },
    select: { marketingOptIn: true },
  });
  if (!buyer?.marketingOptIn) return;
  for (const organizerId of [...new Set(organizerIds)]) {
    await prisma.organizerFollow.upsert({
      where: { userId_organizerId: { userId, organizerId } },
      create: { userId, organizerId },
      update: {},
    });
  }
}

function optionPaymentLine(row: ResolvedOption) {
  return {
    ticketTypeId: row.optionId,
    quantity: row.quantity,
    unitPriceCents: row.unitPriceCents,
    label: row.paymentLabel,
  };
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
    timeZone: EVENT_TIME_ZONE,
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
