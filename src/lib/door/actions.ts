"use server";

import { TicketStatus } from "@prisma/client";
import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";

export type DoorLookup =
  | { ok: false; reason: "unknown" | "cancelled" | "forbidden" | "unpaid" }
  | {
      ok: true;
      code: string;
      status: TicketStatus;
      usedAt: string | null;
      eventTitle: string;
      ticketName: string;
      when: string;
      venue: string;
      buyer: string;
    };

export async function lookupTicket(code: string): Promise<DoorLookup> {
  const user = await requireRole(["ADMIN", "ORGANIZER"], "/door");
  const normalized = code.trim().toUpperCase();
  if (!normalized) return { ok: false, reason: "unknown" };

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
              startsAt: true,
              venue: { select: { name: true, city: true } },
              event: {
                select: {
                  title: true,
                  organizer: { select: { userId: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!ticket) return { ok: false, reason: "unknown" };

  if (
    user.role !== "ADMIN" &&
    ticket.ticketType.session.event.organizer.userId !== user.id
  ) {
    return { ok: false, reason: "forbidden" };
  }

  if (ticket.status === "CANCELLED") return { ok: false, reason: "cancelled" };
  if (ticket.status === "PENDING") return { ok: false, reason: "unpaid" };

  return {
    ok: true,
    code: ticket.code,
    status: ticket.status,
    usedAt: ticket.usedAt?.toISOString() ?? null,
    eventTitle: readTitle(ticket.ticketType.session.event.title, "fr"),
    ticketName: readTitle(ticket.ticketType.name, "fr"),
    when: formatWhen(ticket.ticketType.session.startsAt),
    venue: [
      ticket.ticketType.session.venue?.name,
      ticket.ticketType.session.venue?.city,
    ]
      .filter(Boolean)
      .join(", "),
    buyer: `${ticket.order.firstName} ${ticket.order.lastName}`.trim(),
  };
}

export async function admitTicket(code: string): Promise<DoorLookup> {
  const lookup = await lookupTicket(code);
  if (!lookup.ok) return lookup;
  if (lookup.status === "USED") return lookup;

  const updated = await prisma.ticket.updateMany({
    where: { code: lookup.code, status: "VALID" },
    data: { status: "USED", usedAt: new Date() },
  });

  if (updated.count !== 1) return lookupTicket(lookup.code);

  return {
    ...lookup,
    status: "USED",
    usedAt: new Date().toISOString(),
  };
}

function formatWhen(date: Date): string {
  return new Intl.DateTimeFormat("fr-CH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function readTitle(value: unknown, locale: string): string {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const hit = record[locale] ?? record.fr ?? Object.values(record)[0];
    if (typeof hit === "string") return hit;
  }
  return "";
}
