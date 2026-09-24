import "server-only";

import type { Prisma, UserRole } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { t, type Translated } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export const DOOR_ROLES: UserRole[] = ["ADMIN", "ORGANIZER", "DOOR_STAFF"];

/** Spectacles qu'un compte a le droit de contrôler. */
export function doorEventWhere(user: CurrentUser): Prisma.EventWhereInput {
  if (user.role === "ADMIN") return {};
  if (user.role === "DOOR_STAFF") {
    return user.doorOrganizerId ? { organizerId: user.doorOrganizerId } : {};
  }
  if (user.role === "ORGANIZER" && user.organizerId) {
    return { organizerId: user.organizerId };
  }
  return { id: { in: [] } };
}

export async function canControlSession(
  user: CurrentUser,
  sessionId: string,
): Promise<boolean> {
  const n = await prisma.eventSession.count({
    where: { id: sessionId, event: doorEventWhere(user) },
  });
  return n === 1;
}

export interface DoorSession {
  id: string;
  label: string;
  startsAt: string;
}

/** Séances contrôlables : celles du jour déjà commencées, puis les suivantes. */
export async function getDoorSessions(
  user: CurrentUser,
  locale: string,
): Promise<DoorSession[]> {
  const sessions = await prisma.eventSession.findMany({
    where: {
      startsAt: { gte: new Date(Date.now() - 12 * 60 * 60 * 1000) },
      event: doorEventWhere(user),
    },
    orderBy: { startsAt: "asc" },
    take: 60,
    select: {
      id: true,
      startsAt: true,
      venue: { select: { name: true } },
      event: { select: { title: true } },
    },
  });

  return sessions.map((s) => ({
    id: s.id,
    startsAt: s.startsAt.toISOString(),
    label: [
      t(s.event.title as Translated, locale),
      formatDate(s.startsAt, `${locale}-CH`),
      s.venue?.name,
    ]
      .filter(Boolean)
      .join(" · "),
  }));
}

/**
 * Séance proposée à l'ouverture : celle en cours (commencée il y a moins de
 * quatre heures), sinon la prochaine.
 */
export function defaultDoorSession(
  sessions: DoorSession[],
  now: number = Date.now(),
): DoorSession | null {
  const limite = now - 4 * 60 * 60 * 1000;
  return (
    sessions.find((s) => new Date(s.startsAt).getTime() >= limite) ??
    sessions.at(-1) ??
    null
  );
}

export interface DoorCounts {
  entered: number;
  expected: number;
}

/** Billets payés de la séance, et parmi eux ceux déjà passés à l'entrée. */
export async function getDoorCounts(sessionId: string): Promise<DoorCounts> {
  const rows = await prisma.ticket.groupBy({
    by: ["status"],
    where: {
      ticketType: { sessionId },
      status: { in: ["VALID", "USED"] },
    },
    _count: { _all: true },
  });
  const entered = rows.find((r) => r.status === "USED")?._count._all ?? 0;
  const valid = rows.find((r) => r.status === "VALID")?._count._all ?? 0;
  return { entered, expected: entered + valid };
}
