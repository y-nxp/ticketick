import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { Prisma, type PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { claimSeats, releaseOrderSeats, unavailableAmong } from "@/lib/seating/seats";
import { zoneAllowed } from "@/lib/seating/layout";
import { cancelOrderTickets, issueMissingTickets } from "@/lib/tickets/issue";
import { EVENT_TIME_ZONE } from "@/lib/utils";
import {
  applyAttendees,
  checkAttendees,
  type AttendeeError,
  type AttendeeInput,
} from "./attendees";
import { resolveAutoDiscounts } from "./discounts";
import { inheritPayment, intersectOffers } from "./payment-methods";
import {
  resolveOrderOptions,
  type OptionSelectionInput,
  type ResolvedOption,
} from "./options";
import { CARD_HOLD_MS, HELD_METHODS } from "./reservation";
import { intlLocale } from "@/lib/i18n-fallback";

/**
 * Création d'une commande.
 *
 * Le client n'envoie que des identifiants de tarif, des quantités et, en
 * placement numéroté, les sièges choisis. Les prix sont relus en base : les
 * accepter depuis la requête laisserait n'importe qui fixer le montant.
 */

export interface OrderLineInput {
  ticketTypeId: string;
  quantity: number;
  /** Séance numérotée : exactement un siège par billet. */
  seats?: string[];
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
  holdTokenHash?: string;
  /** Titulaires des billets nominatifs (gratuités d'âge). */
  attendees?: AttendeeInput[];
  /**
   * Exiger les titulaires dès maintenant. La rétention à l'arrivée sur le
   * checkout les ignore : ils ne sont saisis qu'avec les coordonnées.
   */
  requireAttendees?: boolean;
  /**
   * Rétention à l'arrivée sur le checkout : le moyen de paiement n'est pas
   * encore choisi, il sera contrôlé à la validation.
   */
  hold?: boolean;
}

export type CreateOrderResult =
  | { ok: true; order: CreatedOrder }
  | {
      ok: false;
      error: OrderError;
      ticketTypeId?: string;
      /** Sièges déjà pris, à retirer du panier. */
      seatKeys?: string[];
    };

export interface CreatedOrder {
  id: string;
  reference: string;
  subtotalCents: number;
  discountCents: number;
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
  /** Organisateurs du panier : PayPal encaisse sur le compte de l'unique. */
  organizerIds: string[];
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
  | "option_invalid"
  | "invalid_seats"
  | "seat_taken"
  | AttendeeError;

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
  const merged = new Map<string, { quantity: number; seats: string[] }>();
  for (const line of input.lines) {
    const prev = merged.get(line.ticketTypeId) ?? { quantity: 0, seats: [] };
    merged.set(line.ticketTypeId, {
      quantity: prev.quantity + line.quantity,
      seats: [...prev.seats, ...(line.seats ?? [])],
    });
  }
  const quantities = new Map(
    [...merged].map(([id, m]) => [id, m.quantity] as const),
  );

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
      seatZones: true,
      requiresAttendee: true,
      maxAgeYears: true,
      session: {
        select: {
          id: true,
          status: true,
          startsAt: true,
          capacity: true,
          acceptCard: true,
          acceptIban: true,
          seatPlanId: true,
          venueId: true,
          event: {
            select: {
              status: true,
              onlineSale: true,
              slug: true,
              title: true,
              acceptCard: true,
              acceptIban: true,
              acceptPaypal: true,
              organizer: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      },
    },
  });

  const byId = new Map(ticketTypes.map((tt) => [tt.id, tt]));
  const now = new Date();

  for (const [ticketTypeId, { quantity }] of merged) {
    const tt = byId.get(ticketTypeId);
    if (!tt) return { ok: false, error: "unknown_ticket_type", ticketTypeId };

    if (
      tt.session.event.status !== "PUBLISHED" ||
      tt.session.status !== "PUBLISHED" ||
      !tt.session.event.onlineSale
    ) {
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

  // Placement numéroté : un siège par billet, jamais deux fois le même dans
  // la commande. En placement libre, aucun siège n'est accepté.
  const siegesVus = new Map<string, Set<string>>();
  for (const [ticketTypeId, { quantity, seats }] of merged) {
    const tt = byId.get(ticketTypeId)!;
    if (!tt.session.seatPlanId) {
      if (seats.length > 0) return { ok: false, error: "invalid_seats", ticketTypeId };
      continue;
    }
    const vus = siegesVus.get(tt.session.id) ?? new Set<string>();
    if (seats.length !== quantity || seats.some((s) => !s || s.length > 40 || vus.has(s))) {
      return { ok: false, error: "invalid_seats", ticketTypeId };
    }
    seats.forEach((s) => vus.add(s));
    siegesVus.set(tt.session.id, vus);
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
  for (const [ticketTypeId, { quantity }] of merged) {
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
          : (quantities.get(acc.sourceId) ?? 0);
      if (payants === 0) {
        return { ok: false, error: "companion_requires_paid", ticketTypeId: acc.id };
      }
      if (acc.n > payants * acc.ratio) {
        return { ok: false, error: "companion_limit", ticketTypeId: acc.id };
      }
    }
  }

  let holders: Map<string, { name: string; birthDate: Date }[]> = new Map();
  if (input.requireAttendees) {
    const checked = checkAttendees(
      ticketTypes.map((tt) => ({
        id: tt.id,
        requiresAttendee: tt.requiresAttendee,
        maxAgeYears: tt.maxAgeYears,
        sessionStartsAt: tt.session.startsAt,
      })),
      quantities,
      input.attendees ?? [],
    );
    if (!checked.ok) return checked;
    holders = checked.byType;
  }

  const paiement = intersectOffers(
    ticketTypes.map((tt) => inheritPayment(tt.session.event, tt.session)),
  );

  const lines = [...merged].map(([ticketTypeId, { quantity, seats }]) => {
    const tt = byId.get(ticketTypeId)!;
    return {
      ticketTypeId,
      quantity,
      seats,
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

  const discounts = await resolveAutoDiscounts(
    lines.map((l) => {
      const tt = byId.get(l.ticketTypeId)!;
      return {
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        sessionId: tt.session.id,
        venueId: tt.session.venueId,
        organizerId: tt.session.event.organizer.id,
      };
    }),
    now,
  );

  const ticketSubtotal = lines.reduce(
    (sum, l) => sum + l.unitPriceCents * l.quantity,
    0,
  );
  const optionAmount = options.rows.reduce((sum, r) => sum + r.amountCents, 0);
  const subtotalCents = ticketSubtotal + optionAmount;
  const discountCents = discounts.reduce((sum, d) => sum + d.amountCents, 0);
  const feeCents = Math.round(
    ((subtotalCents - discountCents) * PLATFORM_FEE_BPS) / 10_000,
  );
  const totalCents = subtotalCents - discountCents + feeCents;

  if (!input.hold && !methodAllowed(input.paymentMethod, paiement, totalCents)) {
    return { ok: false, error: "method_not_allowed" };
  }

  const paymentLines = [
    ...lines,
    ...options.rows.map(optionPaymentLine),
  ];
  const currency = byId.get(lines[0]!.ticketTypeId)!.currency;
  const project = [
    ...new Set(ticketTypes.map((tt) => tt.session.event.slug)),
  ].join("+");
  const organizerName = ticketTypes[0]?.session.event.organizer.name.trim() ?? "";
  const organizerIds = [
    ...new Set(ticketTypes.map((tt) => tt.session.event.organizer.id)),
  ];

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
          holdTokenHash: input.holdTokenHash,
          subtotalCents,
          discountCents,
          feeCents,
          totalCents,
          currency,
          items: {
            create: lines.map((l) => ({
              ticketTypeId: l.ticketTypeId,
              quantity: l.quantity,
              unitPriceCents: l.unitPriceCents,
              seatKeys: l.seats,
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
          discounts: {
            create: discounts.map((d) => ({
              discountId: d.discountId,
              amountCents: d.amountCents,
            })),
          },
        },
        select: { id: true, reference: true, createdAt: true },
      });

      // Les sièges se prennent une fois la commande créée : ils portent son
      // identifiant, et un seul manquant annule toute la transaction.
      for (const line of lines) {
        if (line.seats.length === 0) continue;
        const tt = byId.get(line.ticketTypeId)!;
        const got = await claimSeats(tx, {
          orderId: order.id,
          sessionId: tt.session.id,
          keys: line.seats,
          zones: tt.seatZones,
        });
        if (got !== line.seats.length) {
          throw new SeatTakenError(line.ticketTypeId, tt.session.id, line.seats);
        }
      }

      await issueMissingTickets(
        tx,
        {
          id: order.id,
          items: lines.map((line) => ({
            ticketTypeId: line.ticketTypeId,
            quantity: line.quantity,
            seatKeys: line.seats,
          })),
        },
        "PENDING",
      );
      await applyAttendees(tx, order.id, holders);

      return order;
    });

    if (input.userId) {
      await followIfOptedIn(input.userId, organizerIds);
    }

    return {
      ok: true,
      order: {
        id: order.id,
        reference: order.reference,
        subtotalCents,
        discountCents,
        feeCents,
        totalCents,
        currency,
        lines: paymentLines,
        project,
        organizerName,
        organizerIds,
        createdAt: order.createdAt,
      },
    };
  } catch (error) {
    if (error instanceof SoldOutError) {
      return { ok: false, error: "sold_out", ticketTypeId: error.ticketTypeId };
    }
    if (error instanceof SeatTakenError) {
      const taken = await unavailableAmong(error.sessionId, error.keys);
      // Un siège hors des zones du tarif n'est pas « pris » : il ne peut pas
      // être vendu sous ce tarif, ce qui revient au même pour l'acheteur.
      const hors = await seatsOutsideZones(error.sessionId, error.keys, byId.get(error.ticketTypeId)?.seatZones ?? []);
      return {
        ok: false,
        error: "seat_taken",
        ticketTypeId: error.ticketTypeId,
        seatKeys: [...new Set([...taken, ...hors])],
      };
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
 * Moyen retenu compatible avec le panier. Une commande à 0 fr. se valide
 * sans encaissement, quel que soit le moyen choisi ; « gratuit » n'est en
 * revanche jamais accepté pour un montant dû.
 */
function methodAllowed(
  method: PaymentMethod,
  offer: { card: boolean; iban: boolean; paypal: boolean },
  totalCents: number,
): boolean {
  if (totalCents === 0) return true;
  switch (method) {
    case "CARD":
      return offer.card;
    case "IBAN":
      return offer.iban;
    case "PAYPAL":
      return offer.paypal;
    case "FREE":
      return false;
    default:
      return true;
  }
}

async function seatsOutsideZones(
  sessionId: string,
  keys: string[],
  zones: string[],
): Promise<string[]> {
  if (zones.length === 0) return [];
  const rows = await prisma.sessionSeat.findMany({
    where: { sessionId, seatKey: { in: keys } },
    select: { seatKey: true, zone: true },
  });
  return rows.filter((r) => !zoneAllowed(zones, r.zone)).map((r) => r.seatKey);
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
      paymentMethod: { in: HELD_METHODS },
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

export function hashHoldToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Libère une rétention à la demande du navigateur qui l'a ouverte.
 *
 * La référence seule ne suffit pas : c'est aussi la communication du virement
 * IBAN, lisible sur n'importe quel relevé, et elle permettait d'annuler la
 * commande d'un autre acheteur.
 */
export async function releaseHeldOrder(
  reference: string,
  token: string,
): Promise<void> {
  if (!token) return;
  const order = await prisma.order.findFirst({
    where: {
      reference,
      status: "AWAITING_PAYMENT",
      // Un virement attendu reste dû : aucun navigateur ne l'annule, pas
      // même celui de l'acheteur qui recommence un panier.
      paymentMethod: { in: HELD_METHODS },
      holdTokenHash: hashHoldToken(token),
    },
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
    await returnOrderStock(tx, orderId);
  });
}

/**
 * Passe une commande payée à REFUNDED et remet ses places en vente, une fois
 * le remboursement accepté par le prestataire. Sans effet si elle n'est plus
 * payée (remboursement déjà enregistré par un autre clic).
 */
export async function recordOrderRefund(orderId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: "PAID" },
      data: { status: "REFUNDED" },
    });
    if (claimed.count === 0) return false;
    await tx.payment.updateMany({
      where: { orderId },
      data: { status: "REFUNDED" },
    });
    await returnOrderStock(tx, orderId);
    return true;
  });
}

async function returnOrderStock(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
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

  await releaseOrderSeats(tx, orderId);
  await cancelOrderTickets(tx, orderId);
}

export const HOLD_PLACEHOLDER_DOMAIN = "hold.ticketick.invalid";

export function isCheckoutHoldEmail(email: string): boolean {
  return email.endsWith(`@${HOLD_PLACEHOLDER_DOMAIN}`);
}

export type CreateHoldResult =
  | { ok: true; order: CreatedOrder; holdToken: string }
  | Extract<CreateOrderResult, { ok: false }>;

/**
 * Retient le stock dès l'arrivée sur le checkout, avant les coordonnées.
 * Le jeton renvoyé n'existe qu'une fois, chez l'appelant : la base n'en garde
 * que l'empreinte.
 */
export async function createCheckoutHold(input: {
  lines: OrderLineInput[];
  locale: string;
}): Promise<CreateHoldResult> {
  const placeholder = randomBytes(8).toString("hex");
  const holdToken = randomBytes(24).toString("base64url");
  const created = await createOrder({
    lines: input.lines,
    email: `hold+${placeholder}@${HOLD_PLACEHOLDER_DOMAIN}`,
    firstName: "—",
    lastName: "—",
    locale: input.locale,
    paymentMethod: "CARD",
    holdTokenHash: hashHoldToken(holdToken),
    hold: true,
  });
  return created.ok ? { ...created, holdToken } : created;
}

/**
 * Relie une rétention encore valable aux coordonnées de l'acheteur,
 * sans re-prélever le stock.
 *
 * Exige le jeton de la rétention : sinon, avec la seule référence d'un
 * paiement carte en cours, on pouvait remplacer l'adresse de l'acheteur et
 * recevoir ses billets.
 */
export async function fulfillCheckoutHold(
  reference: string,
  token: string,
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  if (!token) return { ok: false, error: "hold_expired" };
  const limite = new Date(Date.now() - CARD_HOLD_MS);
  const order = await prisma.order.findFirst({
    where: {
      reference,
      status: "AWAITING_PAYMENT",
      createdAt: { gt: limite },
      holdTokenHash: hashHoldToken(token),
    },
    select: {
      id: true,
      reference: true,
      createdAt: true,
      discountCents: true,
      currency: true,
      items: {
        select: {
          ticketTypeId: true,
          quantity: true,
          unitPriceCents: true,
          seatKeys: true,
        },
      },
    },
  });
  if (!order) return { ok: false, error: "hold_expired" };

  // Le panier validé doit être celui qui a été retenu, sièges compris : sans
  // cela on paierait des places différentes de celles bloquées.
  const attendu = new Map<string, { quantity: number; seats: string[] }>();
  for (const line of input.lines) {
    const prev = attendu.get(line.ticketTypeId) ?? { quantity: 0, seats: [] };
    attendu.set(line.ticketTypeId, {
      quantity: prev.quantity + line.quantity,
      seats: [...prev.seats, ...(line.seats ?? [])],
    });
  }
  if (order.items.length !== attendu.size) {
    return { ok: false, error: "hold_mismatch" };
  }
  for (const item of order.items) {
    const want = attendu.get(item.ticketTypeId);
    if (!want || want.quantity !== item.quantity) {
      return { ok: false, error: "hold_mismatch" };
    }
    const a = [...want.seats].sort().join(",");
    const b = [...item.seatKeys].sort().join(",");
    if (a !== b) return { ok: false, error: "hold_mismatch" };
  }

  const ticketTypes = await prisma.ticketType.findMany({
    where: { id: { in: order.items.map((item) => item.ticketTypeId) } },
    select: {
      id: true,
      name: true,
      requiresAttendee: true,
      maxAgeYears: true,
      session: {
        select: {
          id: true,
          startsAt: true,
          acceptCard: true,
          acceptIban: true,
          event: {
            select: {
              slug: true,
              title: true,
              acceptCard: true,
              acceptIban: true,
              acceptPaypal: true,
              organizer: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });

  const checked = checkAttendees(
    ticketTypes.map((tt) => ({
      id: tt.id,
      requiresAttendee: tt.requiresAttendee,
      maxAgeYears: tt.maxAgeYears,
      sessionStartsAt: tt.session.startsAt,
    })),
    new Map(order.items.map((i) => [i.ticketTypeId, i.quantity] as const)),
    input.attendees ?? [],
  );
  if (!checked.ok) return checked;

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
  // Le rabais a été figé à la rétention, sur les mêmes billets.
  const discountCents = order.discountCents;
  const feeCents = Math.round(
    ((subtotalCents - discountCents) * PLATFORM_FEE_BPS) / 10_000,
  );
  const totalCents = subtotalCents - discountCents + feeCents;

  const paiement = intersectOffers(
    ticketTypes.map((tt) => inheritPayment(tt.session.event, tt.session)),
  );
  if (!methodAllowed(input.paymentMethod, paiement, totalCents)) {
    return { ok: false, error: "method_not_allowed" };
  }

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
        holdTokenHash: input.paymentMethod === "IBAN" ? null : undefined,
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
    await applyAttendees(tx, order.id, checked.byType);
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
      discountCents,
      feeCents,
      totalCents,
      currency: order.currency,
      lines,
      project: [
        ...new Set(ticketTypes.map((tt) => tt.session.event.slug)),
      ].join("+"),
      organizerName: ticketTypes[0]?.session.event.organizer.name.trim() ?? "",
      organizerIds: [
        ...new Set(ticketTypes.map((tt) => tt.session.event.organizer.id)),
      ],
      createdAt: order.createdAt,
    },
  };
}

class SoldOutError extends Error {
  constructor(readonly ticketTypeId: string) {
    super(`Stock insuffisant pour ${ticketTypeId}`);
  }
}

class SeatTakenError extends Error {
  constructor(
    readonly ticketTypeId: string,
    readonly sessionId: string,
    readonly keys: string[],
  ) {
    super(`Siège indisponible pour ${ticketTypeId}`);
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
  const date = new Intl.DateTimeFormat(intlLocale(input.locale), {
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


function readTitle(value: unknown, locale: string): string {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const exact = locale === "es" ? record.es || record.en : record[locale];
    const hit = exact ?? record.fr ?? Object.values(record)[0];
    if (typeof hit === "string") return hit;
  }
  return "";
}
