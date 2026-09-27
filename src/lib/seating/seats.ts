import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readLayout, seatLabel, type SeatLayout } from "./layout";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Sièges numérotés d'une séance.
 *
 * Une ligne `SessionSeat` par siège du plan. Prendre un siège est une mise à
 * jour conditionnelle (`status = 'AVAILABLE'`) évaluée par la base : deux
 * acheteurs qui visent la même place ne peuvent pas l'obtenir tous les deux.
 */

/** Crée les sièges manquants d'une séance d'après son plan. */
export async function syncSessionSeats(sessionId: string, db: Db = prisma) {
  const session = await db.eventSession.findUnique({
    where: { id: sessionId },
    select: { seatPlan: { select: { layout: true } } },
  });
  const layout = readLayout(session?.seatPlan?.layout);
  if (!layout) return 0;
  const { count } = await db.sessionSeat.createMany({
    data: layout.seats.map((s) => ({
      sessionId,
      seatKey: s.key,
      zone: s.zone,
    })),
    skipDuplicates: true,
  });
  return count;
}

/**
 * Retient des sièges pour une commande. Renvoie le nombre obtenu : l'appelant
 * annule la transaction s'il n'a pas tout.
 */
export async function claimSeats(
  tx: Prisma.TransactionClient,
  input: { orderId: string; sessionId: string; keys: string[]; zones: string[] },
): Promise<number> {
  if (input.keys.length === 0) return 0;
  return tx.$executeRaw`
    UPDATE "SessionSeat"
    SET status = 'RESERVED', "orderId" = ${input.orderId}, "updatedAt" = NOW()
    WHERE "sessionId" = ${input.sessionId}
      AND "seatKey" = ANY(${input.keys}::text[])
      AND status = 'AVAILABLE'
      AND (cardinality(${input.zones}::text[]) = 0 OR zone = ANY(${input.zones}::text[]))
  `;
}

/** Rend à la vente les sièges d'une commande annulée. */
export async function releaseOrderSeats(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "SessionSeat"
    SET status = 'AVAILABLE', "orderId" = NULL, "updatedAt" = NOW()
    WHERE "orderId" = ${orderId} AND status = 'RESERVED'
  `;
}

/** Sièges déjà pris parmi ceux demandés, pour le dire à l'acheteur. */
export async function unavailableAmong(
  sessionId: string,
  keys: string[],
): Promise<string[]> {
  if (keys.length === 0) return [];
  const rows = await prisma.sessionSeat.findMany({
    where: { sessionId, seatKey: { in: keys }, status: { not: "AVAILABLE" } },
    select: { seatKey: true },
  });
  const known = await prisma.sessionSeat.findMany({
    where: { sessionId, seatKey: { in: keys } },
    select: { seatKey: true },
  });
  const existing = new Set(known.map((r) => r.seatKey));
  return [
    ...rows.map((r) => r.seatKey),
    ...keys.filter((k) => !existing.has(k)),
  ];
}

/** Plans des séances, pour libeller les sièges. */
export async function layoutsBySession(
  sessionIds: string[],
  db: Db = prisma,
): Promise<Map<string, SeatLayout>> {
  const rows = await db.eventSession.findMany({
    where: { id: { in: sessionIds }, seatPlanId: { not: null } },
    select: { id: true, seatPlan: { select: { layout: true } } },
  });
  const out = new Map<string, SeatLayout>();
  for (const row of rows) {
    const layout = readLayout(row.seatPlan?.layout);
    if (layout) out.set(row.id, layout);
  }
  return out;
}

export function labelSeats(
  layout: SeatLayout | undefined,
  keys: string[],
  locale: string,
): string[] {
  return keys.map((k) => (layout ? seatLabel(layout, k, locale) : k));
}

/** État public d'une séance : plan et sièges non disponibles, sans plus. */
export async function publicSeatState(sessionId: string): Promise<{
  layout: SeatLayout;
  unavailable: string[];
} | null> {
  const session = await prisma.eventSession.findFirst({
    where: {
      id: sessionId,
      status: "PUBLISHED",
      event: { status: "PUBLISHED" },
    },
    select: { seatPlan: { select: { layout: true } } },
  });
  const layout = readLayout(session?.seatPlan?.layout);
  if (!layout) return null;
  const taken = await prisma.sessionSeat.findMany({
    where: { sessionId, status: { not: "AVAILABLE" } },
    select: { seatKey: true },
  });
  return { layout, unavailable: taken.map((t) => t.seatKey) };
}
