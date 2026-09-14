import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { ticketQrPng } from "@/lib/tickets/qr";

const VIOLET = rgb(108 / 255, 92 / 255, 231 / 255);
const INK = rgb(42 / 255, 44 / 255, 48 / 255);
const MUTED = rgb(107 / 255, 114 / 255, 128 / 255);
const RULE = rgb(229 / 255, 231 / 255, 235 / 255);

export interface TicketPdfCard {
  code: string;
  eventTitle: string;
  organizerName?: string;
  ticketName: string;
  when: string;
  venue: string;
  holderName: string;
  reference: string;
}

export async function buildTicketsPdf(
  tickets: TicketPdfCard[],
  locale: string,
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const copy = labels(locale);
  const total = tickets.length;

  for (const [index, ticket] of tickets.entries()) {
    const page = doc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    const margin = 48;
    let y = height - margin;

    page.drawText("ticketick", {
      x: margin,
      y,
      size: 16,
      font: bold,
      color: VIOLET,
    });
    page.drawText(copy.nOf(index + 1, total), {
      x: width - margin - bold.widthOfTextAtSize(copy.nOf(index + 1, total), 12),
      y: y + 2,
      size: 12,
      font: bold,
      color: INK,
    });

    y -= 18;
    page.drawRectangle({
      x: margin,
      y,
      width: width - margin * 2,
      height: 3,
      color: VIOLET,
    });

    y -= 36;
    if (ticket.organizerName) {
      page.drawText(ticket.organizerName.toUpperCase(), {
        x: margin,
        y,
        size: 10,
        font: bold,
        color: VIOLET,
      });
      y -= 22;
    }

    y = drawWrapped(page, ticket.eventTitle, {
      x: margin,
      y,
      maxWidth: width - margin * 2,
      size: 22,
      font: bold,
      color: INK,
      lineHeight: 26,
    });

    y -= 18;
    page.drawText(ticket.ticketName, {
      x: margin,
      y,
      size: 14,
      font: bold,
      color: INK,
    });

    y -= 28;
    page.drawText(ticket.when, {
      x: margin,
      y,
      size: 12,
      font: regular,
      color: MUTED,
    });
    y -= 18;
    page.drawText(ticket.venue, {
      x: margin,
      y,
      size: 12,
      font: regular,
      color: MUTED,
    });

    y -= 28;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 1,
      color: RULE,
    });

    const qr = await doc.embedPng(await ticketQrPng(ticket.code));
    const qrSize = 200;
    y -= qrSize + 24;
    page.drawImage(qr, {
      x: (width - qrSize) / 2,
      y,
      width: qrSize,
      height: qrSize,
    });

    y -= 22;
    const codeWidth = bold.widthOfTextAtSize(ticket.code, 13);
    page.drawText(ticket.code, {
      x: (width - codeWidth) / 2,
      y,
      size: 13,
      font: bold,
      color: INK,
    });

    y -= 36;
    page.drawText(`${copy.holder}  ${ticket.holderName}`, {
      x: margin,
      y,
      size: 11,
      font: regular,
      color: INK,
    });
    y -= 16;
    page.drawText(`${copy.order}  ${ticket.reference}`, {
      x: margin,
      y,
      size: 11,
      font: regular,
      color: MUTED,
    });

    page.drawText(copy.footer, {
      x: margin,
      y: margin,
      size: 9,
      font: regular,
      color: MUTED,
    });
  }

  return Buffer.from(await doc.save());
}

function drawWrapped(
  page: ReturnType<PDFDocument["addPage"]>,
  text: string,
  opts: {
    x: number;
    y: number;
    maxWidth: number;
    size: number;
    font: Awaited<ReturnType<PDFDocument["embedFont"]>>;
    color: ReturnType<typeof rgb>;
    lineHeight: number;
  },
): number {
  const words = text.split(/\s+/);
  let line = "";
  let y = opts.y;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (opts.font.widthOfTextAtSize(next, opts.size) > opts.maxWidth && line) {
      page.drawText(line, {
        x: opts.x,
        y,
        size: opts.size,
        font: opts.font,
        color: opts.color,
      });
      y -= opts.lineHeight;
      line = word;
    } else {
      line = next;
    }
  }
  if (line) {
    page.drawText(line, {
      x: opts.x,
      y,
      size: opts.size,
      font: opts.font,
      color: opts.color,
    });
    y -= opts.lineHeight;
  }
  return y;
}

function labels(locale: string) {
  const pack = {
    fr: {
      nOf: (n: number, total: number) => `Billet ${n} / ${total}`,
      holder: "Titulaire",
      order: "Commande",
      footer: "Présentez ce QR à l’entrée. Chaque billet n’est valable qu’une fois.  ticketick.ch",
    },
    en: {
      nOf: (n: number, total: number) => `Ticket ${n} / ${total}`,
      holder: "Holder",
      order: "Order",
      footer: "Show this QR at the entrance. Each ticket is valid once.  ticketick.ch",
    },
    de: {
      nOf: (n: number, total: number) => `Ticket ${n} / ${total}`,
      holder: "Inhaber",
      order: "Bestellung",
      footer: "QR-Code am Eingang vorzeigen. Jedes Ticket gilt nur einmal.  ticketick.ch",
    },
    it: {
      nOf: (n: number, total: number) => `Biglietto ${n} / ${total}`,
      holder: "Intestatario",
      order: "Ordine",
      footer: "Mostra questo QR all’ingresso. Ogni biglietto è valido una sola volta.  ticketick.ch",
    },
  } as const;
  return pack[locale as keyof typeof pack] ?? pack.fr;
}
