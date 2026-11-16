"use server";

import { requireRole } from "@/lib/auth/dal";
import {
  canControlSession,
  DOOR_ROLES,
  getDoorCounts,
  type DoorCounts,
} from "@/lib/door/scope";
import { prisma } from "@/lib/prisma";
import { t, type Translated } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export interface DoorTicket {
  code: string;
  eventTitle: string;
  ticketName: string;
  when: string;
  venue: string;
  buyer: string;
  seat: string | null;
  /** Gratuité nominative : à comparer avec une pièce d'identité. */
  attendee: string | null;
  attendeeBirthDate: string | null;
}

export type DoorLookup =
  | { ok: false; reason: "unknown" | "cancelled" | "forbidden" | "unpaid" }
  | { ok: false; reason: "otherSession"; ticket: DoorTicket }
  | {
      ok: true;
      /**
       * `admitted` : entrée enregistrée à l'instant ;
       * `valid` : mode vérification, billet valable mais pas enregistré ;
       * `already` : billet déjà passé, à l'heure indiquée par `usedAt`.
       */
      outcome: "admitted" | "valid" | "already";
      usedAt: string | null;
      ticket: DoorTicket;
    };

/**
 * Valide un billet pour la séance contrôlée et le marque comme utilisé.
 *
 * Un billet d'une autre séance est refusé sans être consommé : il reste
 * valable le bon jour.
 */
export async function admitTicket(
  code: string,
  sessionId: string,
  locale: string,
): Promise<DoorLookup> {
  return lookupTicket(code, sessionId, locale, true);
}

/**
 * Mode vérification : dit si le billet serait accepté pour la séance, sans
 * rien enregistrer. Le billet reste valable pour l'entrée.
 */
export async function checkTicket(
  code: string,
  sessionId: string,
  locale: string,
): Promise<DoorLookup> {
  return lookupTicket(code, sessionId, locale, false);
}

async function lookupTicket(
  code: string,
  sessionId: string,
  locale: string,
  admit: boolean,
): Promise<DoorLookup> {
  const user = await requireRole(DOOR_ROLES, "/door");
  const normalized = code.trim().toUpperCase();
  if (!normalized || !sessionId) return { ok: false, reason: "unknown" };

  const ticket = await prisma.ticket.findUnique({
    where: { code: normalized },
    select: {
      code: true,
      status: true,
      usedAt: true,
      seatLabel: true,
      attendeeName: true,
      attendeeBirthDate: true,
      order: { select: { firstName: true, lastName: true, ticketNote: true } },
      ticketType: {
        select: {
          name: true,
          session: {
            select: {
              id: true,
              startsAt: true,
              venue: { select: { name: true, city: true } },
              event: { select: { title: true } },
            },
          },
        },
      },
    },
  });

  if (!ticket) return { ok: false, reason: "unknown" };

  const session = ticket.ticketType.session;
  if (!(await canControlSession(user, session.id))) {
    return { ok: false, reason: "forbidden" };
  }

  if (ticket.status === "CANCELLED") return { ok: false, reason: "cancelled" };
  if (ticket.status === "PENDING") return { ok: false, reason: "unpaid" };

  const info: DoorTicket = {
    code: ticket.code,
    eventTitle: t(session.event.title as Translated, locale),
    ticketName: t(ticket.ticketType.name as Translated, locale),
    when: formatDate(session.startsAt, `${locale}-CH`),
    venue: [session.venue?.name, session.venue?.city].filter(Boolean).join(", "),
    buyer: [`${ticket.order.firstName} ${ticket.order.lastName}`.trim(), ticket.order.ticketNote]
      .filter(Boolean)
      .join(" · "),
    seat: ticket.seatLabel,
    attendee: ticket.attendeeName,
    attendeeBirthDate: ticket.attendeeBirthDate
      ? ticket.attendeeBirthDate.toISOString().slice(0, 10).split("-").reverse().join(".")
      : null,
  };

  if (session.id !== sessionId) {
    return { ok: false, reason: "otherSession", ticket: info };
  }

  if (!admit) {
    return ticket.status === "USED"
      ? { ok: true, outcome: "already", usedAt: ticket.usedAt?.toISOString() ?? null, ticket: info }
      : { ok: true, outcome: "valid", usedAt: null, ticket: info };
  }

  const now = new Date();
  const updated = await prisma.ticket.updateMany({
    where: { code: ticket.code, status: "VALID" },
    data: { status: "USED", usedAt: now },
  });

  if (updated.count === 1) {
    return { ok: true, outcome: "admitted", usedAt: now.toISOString(), ticket: info };
  }

  // Déjà USED, ou passé à l'instant sur un autre appareil : on relit l'heure.
  const current = await prisma.ticket.findUnique({
    where: { code: ticket.code },
    select: { usedAt: true },
  });
  return {
    ok: true,
    outcome: "already",
    usedAt: current?.usedAt?.toISOString() ?? null,
    ticket: info,
  };
}

/** Compteur partagé par tous les appareils qui contrôlent la même séance. */
export async function doorCounts(sessionId: string): Promise<DoorCounts | null> {
  const user = await requireRole(DOOR_ROLES, "/door");
  if (!sessionId || !(await canControlSession(user, sessionId))) return null;
  return getDoorCounts(sessionId);
}

/** Billet tel que le téléphone le garde pour contrôler sans réseau. */
export interface DoorSnapshotTicket {
  code: string;
  /** V valable, U passé, X annulé, P non payé. */
  status: "V" | "U" | "X" | "P";
  usedAt: string | null;
  ticketName: string;
  seat: string | null;
  buyer: string;
  attendee: string | null;
  attendeeBirthDate: string | null;
}

export interface DoorSnapshot {
  sessionId: string;
  eventTitle: string;
  when: string;
  venue: string;
  tickets: DoorSnapshotTicket[];
  /** Heure du serveur au moment de la lecture. */
  at: string;
}

const STATUS_CODE = { VALID: "V", USED: "U", CANCELLED: "X", PENDING: "P" } as const;

/**
 * Tous les billets d'une séance, pour que le téléphone contrôle sans attendre
 * le réseau. Relu en entier à chaque synchronisation : les annulations et les
 * passages enregistrés sur d'autres appareils arrivent ainsi sans cas à part.
 */
export async function doorSnapshot(
  sessionId: string,
  locale: string,
): Promise<DoorSnapshot | null> {
  const user = await requireRole(DOOR_ROLES, "/door");
  if (!sessionId || !(await canControlSession(user, sessionId))) return null;

  const session = await prisma.eventSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: {
      startsAt: true,
      venue: { select: { name: true, city: true } },
      event: { select: { title: true } },
    },
  });
  const tickets = await prisma.ticket.findMany({
    where: { ticketType: { sessionId } },
    select: {
      code: true,
      status: true,
      usedAt: true,
      seatLabel: true,
      attendeeName: true,
      attendeeBirthDate: true,
      order: { select: { firstName: true, lastName: true, ticketNote: true } },
      ticketType: { select: { name: true } },
    },
  });

  return {
    sessionId,
    eventTitle: t(session.event.title as Translated, locale),
    when: formatDate(session.startsAt, `${locale}-CH`),
    venue: [session.venue?.name, session.venue?.city].filter(Boolean).join(", "),
    at: new Date().toISOString(),
    tickets: tickets.map((ticket) => ({
      code: ticket.code,
      status: STATUS_CODE[ticket.status],
      usedAt: ticket.usedAt?.toISOString() ?? null,
      ticketName: t(ticket.ticketType.name as Translated, locale),
      seat: ticket.seatLabel,
      buyer: [`${ticket.order.firstName} ${ticket.order.lastName}`.trim(), ticket.order.ticketNote]
        .filter(Boolean)
        .join(" · "),
      attendee: ticket.attendeeName,
      attendeeBirthDate: ticket.attendeeBirthDate
        ? ticket.attendeeBirthDate.toISOString().slice(0, 10).split("-").reverse().join(".")
        : null,
    })),
  };
}

export type DoorPushResult =
  | { code: string; result: "ok" }
  | { code: string; result: "already"; usedAt: string | null }
  | { code: string; result: "refused"; reason: "unknown" | "cancelled" | "unpaid" };

const MAX_PUSH = 500;

/**
 * Entrées validées sur le téléphone, envoyées dès que le réseau le permet.
 *
 * Chaque entrée garde l'heure du scan. Un renvoi (réponse perdue en route)
 * retrouve cette même heure en base et compte comme réussi ; une autre heure
 * signifie que le billet est passé ailleurs avant : le téléphone le signale.
 */
export async function doorPush(
  sessionId: string,
  entries: { code: string; at: string }[],
): Promise<DoorPushResult[] | null> {
  const user = await requireRole(DOOR_ROLES, "/door");
  if (!sessionId || !(await canControlSession(user, sessionId))) return null;

  const now = Date.now();
  const results: DoorPushResult[] = [];
  for (const entry of entries.slice(0, MAX_PUSH)) {
    const code = String(entry.code ?? "").trim().toUpperCase();
    let at = new Date(entry.at);
    // Horloge du téléphone absurde : l'heure du serveur fait foi.
    if (Number.isNaN(at.getTime()) || at.getTime() > now + 5 * 60_000) at = new Date(now);

    const ticket = await prisma.ticket.findFirst({
      where: { code, ticketType: { sessionId } },
      select: { status: true },
    });
    if (!ticket) {
      results.push({ code, result: "refused", reason: "unknown" });
      continue;
    }
    if (ticket.status === "CANCELLED" || ticket.status === "PENDING") {
      results.push({
        code,
        result: "refused",
        reason: ticket.status === "CANCELLED" ? "cancelled" : "unpaid",
      });
      continue;
    }
    const updated = await prisma.ticket.updateMany({
      where: { code, status: "VALID" },
      data: { status: "USED", usedAt: at },
    });
    if (updated.count === 1) {
      results.push({ code, result: "ok" });
      continue;
    }
    const current = await prisma.ticket.findUnique({ where: { code }, select: { usedAt: true } });
    const usedAt = current?.usedAt?.toISOString() ?? null;
    results.push(
      usedAt === at.toISOString() ? { code, result: "ok" } : { code, result: "already", usedAt },
    );
  }
  return results;
}
