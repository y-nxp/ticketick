import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildTicketsPdf, type TicketPdfCard } from "@/lib/tickets/pdf";
import { toTicketCard } from "@/lib/tickets/payload";

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

export const ticketOrderSelect = Prisma.validator<Prisma.TicketSelect>()({
  code: true,
  attendeeName: true,
  seatLabel: true,
  ticketType: {
    select: {
      name: true,
      priceCents: true,
      currency: true,
      session: {
        select: {
          startsAt: true,
          doorsAt: true,
          venue: {
            select: { name: true, address: true, zip: true, city: true },
          },
          event: {
            select: {
              title: true,
              organizer: {
                select: { name: true, logoUrl: true, notifyEmails: true },
              },
            },
          },
        },
      },
    },
  },
});

export async function paidTicketsForPdf(
  reference: string,
): Promise<{ locale: string; cards: TicketPdfCard[] } | null> {
  const order = await prisma.order.findUnique({
    where: { reference },
    select: {
      status: true,
      firstName: true,
      lastName: true,
      locale: true,
      reference: true,
      tickets: {
        orderBy: { createdAt: "asc" },
        select: ticketOrderSelect,
      },
    },
  });

  if (!order || order.status !== "PAID" || order.tickets.length === 0) {
    return null;
  }

  const holder = `${order.firstName} ${order.lastName}`.trim();
  return {
    locale: order.locale,
    cards: mapTickets(order.tickets, holder, order.reference, order.locale),
  };
}

export async function paidOrderForMail(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      email: true,
      firstName: true,
      lastName: true,
      locale: true,
      reference: true,
      tickets: {
        orderBy: { createdAt: "asc" },
        select: ticketOrderSelect,
      },
    },
  });
  if (!order || order.tickets.length === 0) return null;
  const holder = `${order.firstName} ${order.lastName}`.trim();
  return {
    email: order.email,
    buyerName: holder,
    reference: order.reference,
    locale: order.locale,
    notifyEmails: [
      ...new Set(
        order.tickets.flatMap(
          (ticket) => ticket.ticketType.session.event.organizer.notifyEmails,
        ),
      ),
    ],
    cards: mapTickets(order.tickets, holder, order.reference, order.locale),
  };
}

function mapTickets(
  tickets: {
    code: string;
    attendeeName: string | null;
    seatLabel: string | null;
    ticketType: {
      name: unknown;
      priceCents: number;
      currency: string;
      session: {
        startsAt: Date;
        doorsAt: Date | null;
        venue: {
          name: string;
          address: string | null;
          zip: string | null;
          city: string;
        } | null;
        event: {
          title: unknown;
          organizer: {
            name: string;
            logoUrl: string | null;
            notifyEmails: string[];
          };
        };
      };
    };
  }[],
  holder: string,
  reference: string,
  locale: string,
) {
  return tickets.map((ticket) => {
    const session = ticket.ticketType.session;
    return toTicketCard({
      code: ticket.code,
      eventTitle: session.event.title,
      ticketName: ticket.ticketType.name,
      organizerName: session.event.organizer.name,
      organizerLogoUrl: session.event.organizer.logoUrl,
      startsAt: session.startsAt,
      doorsAt: session.doorsAt,
      venue: session.venue,
      holderName: ticket.attendeeName?.trim() || holder,
      reference,
      priceCents: ticket.ticketType.priceCents,
      currency: ticket.ticketType.currency,
      seatLabel: ticket.seatLabel,
      locale,
    });
  });
}

export async function ticketsPdfBuffer(reference: string): Promise<Buffer | null> {
  const data = await paidTicketsForPdf(reference);
  if (!data) return null;
  return buildTicketsPdf(data.cards, data.locale);
}
