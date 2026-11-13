import "server-only";

import type { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { isValidIban, normalizeIban } from "@/lib/iban";
import { prisma } from "@/lib/prisma";
import { EVENT_TIME_ZONE } from "@/lib/utils";
import { markLinkUsed, resolveAccess, type ChangeAccess } from "./change-access";
import { hashHoldToken } from "./create-order";
import {
  assertEditable,
  closeIfEmpty,
  EditFailure,
  lockOrder,
  nextChargeNumber,
  REFUNDABLE_PROVIDERS,
  releaseTickets,
  run,
  type EditError,
  type LockedOrder,
} from "./edit-order";
import { dropPendingChanges } from "./seat-change";
import { netTicketPrices } from "./self-service-rules";

/**
 * Programme modifié (un artiste annulé, un récital à la place d'un duo) :
 * l'organisateur envoie aux acheteurs d'une séance un lien valable deux
 * semaines. Le client garde ses billets, les annule billet par billet, ou les
 * échange contre un autre spectacle. Il récupère ce qu'il a réellement payé,
 * rabais déduit : sur sa carte quand le paiement passe par un prestataire,
 * sinon par virement sur le compte qu'il indique.
 *
 * Le lien ne touche jamais aux billets des autres spectacles de la commande.
 */

export const PROGRAMME_DAYS = 14;

/**
 * Dates du formulaire (AAAA-MM-JJ, heure suisse) : la date limite proposée,
 * dans deux semaines mais au plus tard la veille de la séance, et la
 * dernière possible, le jour de la séance.
 */
export function programmeDeadlines(startsAt: Date): { until: string; max: string } {
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: EVENT_TIME_ZONE }).format(d);
  const inTwoWeeks = new Date(Date.now() + PROGRAMME_DAYS * 24 * 3600 * 1000);
  const eve = new Date(startsAt.getTime() - 24 * 3600 * 1000);
  return { until: day(inTwoWeeks < eve ? inTwoWeeks : eve), max: day(startsAt) };
}

/** Comment l'argent revient au client. `none` : rien n'a été encaissé par ticketick. */
export type RefundMode = "provider" | "transfer" | "none";

const TRANSFER_PROVIDERS = ["iban", "cash", "terminal", "transfer"];

export function refundModeOf(
  payment: { provider: string; status: string } | null | undefined,
): RefundMode {
  if (!payment || payment.status !== "COMPLETED") return "none";
  if (REFUNDABLE_PROVIDERS.includes(payment.provider)) return "provider";
  if (TRANSFER_PROVIDERS.includes(payment.provider)) return "transfer";
  return "none";
}

export type ProgrammeError =
  | EditError
  | "expired"
  | "accountRequired"
  | "notProgramme";

export interface RefundAccount {
  iban?: string;
  holder?: string;
}

/** Compte du client pour un virement : IBAN valide et titulaire, exigés seulement s'il y a à rendre. */
export function readRefundAccount(
  input: RefundAccount,
): { ok: true; iban: string; holder: string } | { ok: false; error: "ibanMissing" | "ibanInvalid" } {
  const iban = normalizeIban(input.iban ?? "");
  const holder = (input.holder ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  if (!iban || !holder) return { ok: false, error: "ibanMissing" };
  if (!isValidIban(iban)) return { ok: false, error: "ibanInvalid" };
  return { ok: true, iban, holder };
}

/** Prix réellement payé par billet de la commande, rabais déduit. */
export async function paidByTicketType(
  tx: Prisma.TransactionClient | typeof prisma,
  orderId: string,
): Promise<Map<string, number>> {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      subtotalCents: true,
      discountCents: true,
      feeCents: true,
      items: {
        select: { ticketTypeId: true, quantity: true, unitPriceCents: true, discountCents: true },
      },
    },
  });
  return netTicketPrices(order);
}

/**
 * Remboursement ouvert dans la transaction : chez le prestataire (exécuté
 * juste après, hors transaction) ou par virement (note de crédit, avec le
 * compte du client). Jamais plus que ce qui reste encaissé.
 */
export async function openProgrammeRefund(
  tx: Prisma.TransactionClient,
  order: LockedOrder,
  input: {
    amountCents: number;
    ticketIds: string[];
    mode: RefundMode;
    account: { iban: string; holder: string } | null;
    actorId: string | null;
  },
): Promise<{ chargeId: string; method: "PROVIDER" | "CREDIT_NOTE" } | null> {
  if (input.amountCents <= 0 || input.mode === "none") return null;
  const pending = await tx.orderCharge.aggregate({
    where: { orderId: order.id, kind: "REFUND", status: { in: ["OPEN", "FAILED"] } },
    _sum: { amountCents: true },
  });
  const refundable = order.totalCents - (pending._sum.amountCents ?? 0);
  if (input.amountCents > refundable) throw new EditFailure("refundTooHigh");
  const method = input.mode === "provider" ? "PROVIDER" : "CREDIT_NOTE";
  if (method === "CREDIT_NOTE" && !input.account) throw new EditFailure("ibanMissing");

  const charge = await tx.orderCharge.create({
    data: {
      orderId: order.id,
      number: await nextChargeNumber(tx, order),
      kind: "REFUND",
      method,
      status: "OPEN",
      amountCents: input.amountCents,
      currency: order.currency,
      ticketIds: input.ticketIds,
      refundIban: input.account?.iban ?? null,
      refundHolder: input.account?.holder ?? null,
      createdById: input.actorId,
    },
    select: { id: true },
  });
  return { chargeId: charge.id, method };
}

// ─────────────────────────────── Lien

/**
 * Lien « programme modifié » d'une commande, valable deux semaines (au plus
 * jusqu'au début de la séance). Remplace le précédent lien de la même séance ;
 * les liens ordinaires de la commande restent valables.
 */
export async function createProgrammeLink(input: {
  orderId: string;
  sessionId: string;
  actorId: string;
  /** Date limite choisie par l'organisateur ; à défaut, deux semaines. */
  until?: Date;
}): Promise<{ ok: true; token: string; expiresAt: Date } | { ok: false; error: EditError }> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      status: true,
      resellerId: true,
      tickets: {
        where: { status: "VALID", ticketType: { sessionId: input.sessionId } },
        select: { ticketType: { select: { session: { select: { startsAt: true } } } } },
      },
    },
  });
  if (!order) return { ok: false, error: "notFound" };
  if (order.status !== "PAID") return { ok: false, error: "notEditable" };
  if (order.resellerId) return { ok: false, error: "reseller" };
  const startsAt = order.tickets[0]?.ticketType.session.startsAt;
  if (!startsAt) return { ok: false, error: "empty" };
  if (startsAt <= new Date()) return { ok: false, error: "sessionPast" };

  const limit = input.until ?? new Date(Date.now() + PROGRAMME_DAYS * 24 * 3600 * 1000);
  const expiresAt = startsAt < limit ? startsAt : limit;
  const token = randomBytes(24).toString("base64url");
  await prisma.$transaction([
    prisma.orderChangeLink.deleteMany({
      where: { orderId: input.orderId, sessionId: input.sessionId },
    }),
    prisma.orderChangeLink.create({
      data: {
        orderId: input.orderId,
        sessionId: input.sessionId,
        tokenHash: hashHoldToken(token),
        expiresAt,
        createdById: input.actorId,
      },
    }),
  ]);
  return { ok: true, token, expiresAt };
}

// ─────────────────────────────── Billets de la séance

export interface ProgrammeTicket {
  id: string;
  ticketTypeId: string;
  tariffName: unknown;
  seatLabel: string | null;
  paidCents: number;
}

/** Billets encore valables de la séance, avec ce que le client a payé pour chacun. */
export async function programmeTickets(
  orderId: string,
  sessionId: string,
): Promise<ProgrammeTicket[]> {
  const [tickets, paid] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        orderId,
        status: "VALID",
        ticketType: { sessionId, session: { startsAt: { gt: new Date() } } },
      },
      orderBy: [{ seatKey: "asc" }, { createdAt: "asc" }],
      select: { id: true, ticketTypeId: true, seatLabel: true, ticketType: { select: { name: true } } },
    }),
    paidByTicketType(prisma, orderId),
  ]);
  return tickets.map((t) => ({
    id: t.id,
    ticketTypeId: t.ticketTypeId,
    tariffName: t.ticketType.name,
    seatLabel: t.seatLabel,
    paidCents: paid.get(t.ticketTypeId) ?? 0,
  }));
}

// ─────────────────────────────── Annulation

export type ProgrammeCancelResult =
  | {
      ok: true;
      orderId: string;
      refundCents: number;
      refund: { chargeId: string; method: "PROVIDER" | "CREDIT_NOTE" } | null;
    }
  | { ok: false; error: ProgrammeError };

/** Le client rend des billets de la séance ; on lui rend ce qu'il a payé pour eux. */
export async function cancelProgrammeTickets(input: {
  access: ChangeAccess;
  ticketIds: string[];
  account: RefundAccount;
}): Promise<ProgrammeCancelResult> {
  const ids = [...new Set(input.ticketIds)];
  if (ids.length === 0) return { ok: false, error: "empty" };
  const resolved = await resolveAccess(input.access);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const access = resolved.access;
  const sessionId = access.programmeSessionId;
  if (!sessionId) return { ok: false, error: "notProgramme" };

  const eligible = await programmeTickets(access.orderId, sessionId);
  const chosen = eligible.filter((t) => ids.includes(t.id));
  if (chosen.length !== ids.length) return { ok: false, error: "notFound" };
  const refundCents = chosen.reduce((sum, t) => sum + t.paidCents, 0);

  const payment = await prisma.payment.findUnique({
    where: { orderId: access.orderId },
    select: { provider: true, status: true },
  });
  const mode = refundModeOf(payment);
  let account: { iban: string; holder: string } | null = null;
  if (refundCents > 0 && mode === "transfer") {
    const read = readRefundAccount(input.account);
    if (!read.ok) return { ok: false, error: read.error };
    account = { iban: read.iban, holder: read.holder };
  }

  return run(() =>
    prisma.$transaction(async (tx) => {
      let order = await lockOrder(tx, access.orderId);
      assertEditable(order, false);
      if (order.resellerId) throw new EditFailure("reseller");
      // Un échange commencé mais pas payé : abandonné, ses places repartent.
      if (await dropPendingChanges(tx, order.id)) order = await lockOrder(tx, order.id);
      const valid = new Set(order.tickets.filter((t) => t.status === "VALID").map((t) => t.id));
      if (ids.some((id) => !valid.has(id))) throw new EditFailure("notFound");

      await releaseTickets(tx, order, ids, false);
      const refund = await openProgrammeRefund(tx, order, {
        amountCents: mode === "none" ? 0 : refundCents,
        ticketIds: ids,
        mode,
        account,
        actorId: access.actorId,
      });
      await closeIfEmpty(tx, order, ids, refund !== null);
      await markLinkUsed(tx, access.linkId);
      return {
        ok: true as const,
        orderId: order.id,
        refundCents: refund ? refundCents : 0,
        refund,
      };
    }),
  );
}

// ─────────────────────────────── Admin : acheteurs de la séance

export interface ProgrammeBuyer {
  orderId: string;
  reference: string;
  name: string;
  email: string;
  locale: string;
  tickets: number;
  paidCents: number;
  /** Autres spectacles de la même commande (non concernés par le lien). */
  otherShows: number;
  reseller: string | null;
  refundMode: RefundMode;
  link: { sentAt: Date; expiresAt: Date; usedAt: Date | null } | null;
}

/** Commandes payées qui ont des billets valables sur la séance. */
export async function programmeBuyers(sessionId: string): Promise<ProgrammeBuyer[]> {
  const orders = await prisma.order.findMany({
    where: {
      status: "PAID",
      tickets: { some: { status: "VALID", ticketType: { sessionId } } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      reference: true,
      firstName: true,
      lastName: true,
      email: true,
      locale: true,
      subtotalCents: true,
      discountCents: true,
      feeCents: true,
      reseller: { select: { name: true } },
      payment: { select: { provider: true, status: true } },
      items: {
        select: {
          ticketTypeId: true,
          quantity: true,
          unitPriceCents: true,
          discountCents: true,
          ticketType: { select: { sessionId: true } },
        },
      },
      tickets: {
        where: { status: "VALID" },
        select: { ticketTypeId: true, ticketType: { select: { sessionId: true } } },
      },
      changeLinks: {
        where: { sessionId },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true, expiresAt: true, usedAt: true },
      },
    },
  });
  return orders.map((order) => {
    const paid = netTicketPrices(order);
    const here = order.tickets.filter((t) => t.ticketType.sessionId === sessionId);
    const others = new Set(
      order.tickets.map((t) => t.ticketType.sessionId).filter((id) => id !== sessionId),
    );
    const link = order.changeLinks[0];
    return {
      orderId: order.id,
      reference: order.reference,
      name: `${order.firstName} ${order.lastName}`.trim(),
      email: order.email,
      locale: order.locale,
      tickets: here.length,
      paidCents: here.reduce((sum, t) => sum + (paid.get(t.ticketTypeId) ?? 0), 0),
      otherShows: others.size,
      reseller: order.reseller?.name ?? null,
      refundMode: refundModeOf(order.payment),
      link: link ? { sentAt: link.createdAt, expiresAt: link.expiresAt, usedAt: link.usedAt } : null,
    };
  });
}

