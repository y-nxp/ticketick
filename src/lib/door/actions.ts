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
}

export type DoorLookup =
  | { ok: false; reason: "unknown" | "cancelled" | "forbidden" | "unpaid" }
  | { ok: false; reason: "otherSession"; ticket: DoorTicket }
  | {
      ok: true;
      /** `already` : billet déjà passé, à l'heure indiquée par `usedAt`. */
      outcome: "admitted" | "already";
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
  const user = await requireRole(DOOR_ROLES, "/door");
  const normalized = code.trim().toUpperCase();
  if (!normalized || !sessionId) return { ok: false, reason: "unknown" };

  const ticket = await prisma.ticket.findUnique({
    where: { code: normalized },
    select: {
      code: true,
      status: true,
      usedAt: true,
      order: { select: { firstName: true, lastName: true } },
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
    buyer: `${ticket.order.firstName} ${ticket.order.lastName}`.trim(),
  };

  if (session.id !== sessionId) {
    return { ok: false, reason: "otherSession", ticket: info };
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
