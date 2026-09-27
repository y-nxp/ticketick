import "server-only";

import type { Prisma } from "@prisma/client";
import { EVENT_TIME_ZONE } from "@/lib/utils";

/**
 * Titulaires nominatifs : nom complet et date de naissance exigés par les
 * gratuités d'âge (moins de 25 ans). L'âge est calculé au jour de la séance,
 * dans le fuseau de l'événement ; la pièce d'identité se contrôle à l'entrée.
 */

export interface AttendeeInput {
  ticketTypeId: string;
  name: string;
  /** AAAA-MM-JJ */
  birthDate: string;
}

export type AttendeeError =
  | "attendee_missing"
  | "attendee_invalid"
  | "attendee_too_old";

export interface AttendeeRule {
  id: string;
  requiresAttendee: boolean;
  maxAgeYears: number | null;
  sessionStartsAt: Date;
}

type Holder = { name: string; birthDate: Date };

function localDay(date: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: EVENT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** Âge révolu le jour (local) de `on`. */
export function ageOn(birth: Date, on: Date): number {
  const b = { y: birth.getUTCFullYear(), m: birth.getUTCMonth() + 1, d: birth.getUTCDate() };
  const o = localDay(on);
  let age = o.y - b.y;
  if (o.m < b.m || (o.m === b.m && o.d < b.d)) age -= 1;
  return age;
}

function parseBirthDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== value) return null;
  if (date.getUTCFullYear() < 1900 || date.getTime() > Date.now()) return null;
  return date;
}

export function checkAttendees(
  rules: AttendeeRule[],
  quantities: Map<string, number>,
  attendees: AttendeeInput[],
):
  | { ok: true; byType: Map<string, Holder[]> }
  | { ok: false; error: AttendeeError; ticketTypeId: string } {
  const byType = new Map<string, Holder[]>();
  for (const rule of rules) {
    if (!rule.requiresAttendee) continue;
    const wanted = quantities.get(rule.id) ?? 0;
    const given = attendees.filter((a) => a.ticketTypeId === rule.id);
    if (given.length < wanted) {
      return { ok: false, error: "attendee_missing", ticketTypeId: rule.id };
    }
    const holders: Holder[] = [];
    for (const a of given.slice(0, wanted)) {
      const name = a.name.trim().replace(/\s+/g, " ");
      const birthDate = parseBirthDate(a.birthDate);
      if (name.length < 3 || !name.includes(" ") || !birthDate) {
        return { ok: false, error: "attendee_invalid", ticketTypeId: rule.id };
      }
      if (
        rule.maxAgeYears != null &&
        ageOn(birthDate, rule.sessionStartsAt) >= rule.maxAgeYears
      ) {
        return { ok: false, error: "attendee_too_old", ticketTypeId: rule.id };
      }
      holders.push({ name: name.slice(0, 120), birthDate });
    }
    byType.set(rule.id, holders);
  }
  return { ok: true, byType };
}

/** Inscrit les titulaires sur les billets de la commande, dans l'ordre d'émission. */
export async function applyAttendees(
  tx: Prisma.TransactionClient,
  orderId: string,
  byType: Map<string, Holder[]>,
): Promise<void> {
  for (const [ticketTypeId, holders] of byType) {
    const tickets = await tx.ticket.findMany({
      where: { orderId, ticketTypeId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    for (let i = 0; i < tickets.length && i < holders.length; i++) {
      await tx.ticket.update({
        where: { id: tickets[i]!.id },
        data: {
          attendeeName: holders[i]!.name,
          attendeeBirthDate: holders[i]!.birthDate,
        },
      });
    }
  }
}
