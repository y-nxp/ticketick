import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { buildTicketsPdf, type TicketPdfCard } from "@/lib/tickets/pdf";

function secret(): string {
  return process.env.AUTH_SECRET ?? "";
}

export function ticketPdfToken(reference: string): string {
  return createHmac("sha256", secret())
    .update(`ticket-pdf:${reference}`)
    .digest("base64url")
    .slice(0, 32);
}

export function ticketPdfTokenOk(reference: string, token: string): boolean {
  if (!token || !secret()) return false;
  const expected = ticketPdfToken(reference);
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function ticketPdfPath(reference: string): string {
  return `/api/tickets/pdf?ref=${encodeURIComponent(reference)}&t=${ticketPdfToken(reference)}`;
}

export async function paidTicketsForPdf(
  reference: string,
): Promise<{ locale: string; cards: TicketPdfCard[] } | null> {
  const order = await prisma.order.findUnique({
    where: { reference },
    select: {
      status: true,
      email: true,
      firstName: true,
      lastName: true,
      locale: true,
      reference: true,
      tickets: {
        orderBy: { createdAt: "asc" },
        select: {
          code: true,
          attendeeName: true,
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
                      organizer: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!order || order.status !== "PAID" || order.tickets.length === 0) {
    return null;
  }

  const holder = `${order.firstName} ${order.lastName}`.trim();
  return {
    locale: order.locale,
    cards: order.tickets.map((ticket) => {
      const session = ticket.ticketType.session;
      return {
        code: ticket.code,
        eventTitle: readTitle(session.event.title, order.locale),
        organizerName: session.event.organizer.name,
        ticketName: readTitle(ticket.ticketType.name, order.locale),
        when: formatWhen(session.startsAt, order.locale),
        venue: [session.venue?.name, session.venue?.city]
          .filter(Boolean)
          .join(", "),
        holderName: ticket.attendeeName?.trim() || holder,
        reference: order.reference,
      };
    }),
  };
}

export async function ticketsPdfBuffer(reference: string): Promise<Buffer | null> {
  const data = await paidTicketsForPdf(reference);
  if (!data) return null;
  return buildTicketsPdf(data.cards, data.locale);
}

function formatWhen(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(`${locale}-CH`, {
    weekday: "long",
    day: "numeric",
    month: "long",
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
