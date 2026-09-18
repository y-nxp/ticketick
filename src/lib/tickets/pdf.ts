import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { ticketQrPng } from "@/lib/tickets/qr";
import {
  pdfSafe,
  readPublicFile,
  type TicketCard,
  type TicketOptionBlock,
} from "@/lib/tickets/payload";

export type TicketPdfCard = TicketCard;

const VIOLET = rgb(108 / 255, 92 / 255, 231 / 255);
const INK = rgb(42 / 255, 44 / 255, 48 / 255);
const MUTED = rgb(107 / 255, 114 / 255, 128 / 255);
const RULE = rgb(229 / 255, 231 / 255, 235 / 255);
const PAPER = rgb(1, 1, 1);
const WASH = rgb(248 / 255, 249 / 255, 250 / 255);

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
    const margin = 42;
    const contentW = width - margin * 2;
    let y = height - margin;

    page.drawRectangle({
      x: 0,
      y: 0,
      width,
      height,
      color: PAPER,
    });

    const logoBytes = await readPublicFile(ticket.organizerLogoUrl);
    let logoHeight = 36;
    if (logoBytes) {
      const logo = await embedImage(doc, logoBytes, ticket.organizerLogoUrl);
      const logoH = 56;
      const logoW = Math.min((logo.width / logo.height) * logoH, 220);
      page.drawImage(logo, {
        x: margin,
        y: y - logoH + 10,
        width: logoW,
        height: logoH,
      });
      logoHeight = logoH;
    } else if (ticket.organizerName) {
      page.drawText(pdfSafe(ticket.organizerName), {
        x: margin,
        y: y - 8,
        size: 14,
        font: bold,
        color: INK,
      });
    }

    const brand = "ticketick";
    page.drawText(brand, {
      x: width - margin - bold.widthOfTextAtSize(brand, 13),
      y,
      size: 13,
      font: bold,
      color: VIOLET,
    });
    const nOf = pdfSafe(copy.nOf(index + 1, total));
    page.drawText(nOf, {
      x: width - margin - regular.widthOfTextAtSize(nOf, 10),
      y: y - 16,
      size: 10,
      font: regular,
      color: MUTED,
    });

    if (!ticket.valid) {
      const banner = pdfSafe(copy.unpaid);
      const bannerW = Math.min(contentW, bold.widthOfTextAtSize(banner, 11) + 24);
      page.drawRectangle({
        x: width - margin - bannerW,
        y: y - 42,
        width: bannerW,
        height: 18,
        color: rgb(0.75, 0.16, 0.18),
      });
      page.drawText(banner, {
        x: width - margin - bannerW + 12,
        y: y - 37,
        size: 8,
        font: bold,
        color: PAPER,
      });
    }

    y -= logoHeight + 18;
    page.drawRectangle({
      x: margin,
      y,
      width: contentW,
      height: 2.5,
      color: VIOLET,
    });

    y -= 28;
    if (ticket.organizerName) {
      page.drawText(pdfSafe(ticket.organizerName.toUpperCase()), {
        x: margin,
        y,
        size: 9,
        font: bold,
        color: VIOLET,
      });
      y -= 18;
    }

    y = drawWrapped(page, pdfSafe(ticket.eventTitle), {
      x: margin,
      y,
      maxWidth: contentW,
      size: 20,
      font: bold,
      color: INK,
      lineHeight: 24,
    });

    y -= 8;
    page.drawText(pdfSafe(ticket.when), {
      x: margin,
      y,
      size: 12,
      font: regular,
      color: INK,
    });

    y -= 22;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 1,
      color: RULE,
    });

    const qr = await doc.embedPng(await ticketQrPng(ticket.code));
    const qrSize = 148;
    const factsX = margin + qrSize + 24;
    const factsW = width - margin - factsX;
    const factsTop = y - 18;

    page.drawImage(qr, {
      x: margin,
      y: factsTop - qrSize,
      width: qrSize,
      height: qrSize,
    });
    const codeW = bold.widthOfTextAtSize(ticket.code, 10);
    page.drawText(ticket.code, {
      x: margin + (qrSize - codeW) / 2,
      y: factsTop - qrSize - 16,
      size: 10,
      font: bold,
      color: INK,
    });
    if (!ticket.valid) {
      const stamp = pdfSafe(copy.unpaidShort);
      const stampW = bold.widthOfTextAtSize(stamp, 8);
      page.drawText(stamp, {
        x: margin + (qrSize - stampW) / 2,
        y: factsTop - qrSize - 28,
        size: 8,
        font: bold,
        color: rgb(0.75, 0.16, 0.18),
      });
    }

    const pairs: [string, string][] = [
      [copy.start, ticket.startTime],
      ...(ticket.doorsTime ? [[copy.doors, ticket.doorsTime] as [string, string]] : []),
      [copy.price, ticket.priceLabel],
      [copy.tariff, ticket.ticketName],
      [copy.holder, ticket.holderName],
      [copy.place, ticket.seating],
      [copy.order, ticket.reference],
    ];

    const colGap = 16;
    const colW = (factsW - colGap) / 2;
    let fy = factsTop - 2;
    for (let i = 0; i < pairs.length; i += 2) {
      const left = pairs[i];
      const right = pairs[i + 1];
      const rowH = drawFact(page, left[0], left[1], {
        x: factsX,
        y: fy,
        width: colW,
        bold,
      });
      let rightH = 0;
      if (right) {
        rightH = drawFact(page, right[0], right[1], {
          x: factsX + colW + colGap,
          y: fy,
          width: colW,
          bold,
        });
      }
      fy -= Math.max(rowH, rightH) + 12;
    }

    y = Math.min(factsTop - qrSize - 28, fy) - 6;
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 1,
      color: RULE,
    });

    y -= 20;
    page.drawText(pdfSafe(copy.address), {
      x: margin,
      y,
      size: 8,
      font: bold,
      color: MUTED,
    });
    y -= 14;
    for (const line of ticket.venueLines) {
      page.drawText(pdfSafe(line), {
        x: margin,
        y,
        size: 12,
        font: regular,
        color: INK,
      });
      y -= 16;
    }

    y -= 6;
    y = drawWrapped(page, pdfSafe(copy.practical), {
      x: margin,
      y,
      maxWidth: contentW,
      size: 10,
      font: regular,
      color: INK,
      lineHeight: 13,
    });

    if (ticket.optionBlocks?.length) {
      y -= 14;
      for (const block of ticket.optionBlocks) {
        y = drawOptionBlock(page, block, {
          x: margin,
          y,
          width: contentW,
          bold,
          regular,
        });
        y -= 10;
      }
    }

    const disclaimer = pdfSafe(ticket.disclaimer ?? copy.disclaimer);
    const discSize = 7.5;
    const discLh = 10;
    const discLines = wrapLines(disclaimer, regular, discSize, contentW);

    const footerLogos: { img: Awaited<ReturnType<typeof embedImage>>; w: number; h: number }[] =
      [];
    const brandBytes = await readPublicFile("/brand/logo_standard.png");
    if (brandBytes) {
      const img = await embedImage(doc, brandBytes, "/brand/logo_standard.png");
      const h = 14;
      footerLogos.push({ img, h, w: (img.width / img.height) * h });
    }
    const producerBytes = await readPublicFile(ticket.producerLogoUrl);
    if (producerBytes && ticket.producerLogoUrl) {
      const img = await embedImage(doc, producerBytes, ticket.producerLogoUrl);
      const h = 36;
      footerLogos.push({
        img,
        h,
        w: Math.min((img.width / img.height) * h, 130),
      });
    }

    const logoGap = 22;
    const rowH = footerLogos.reduce((max, logo) => Math.max(max, logo.h), 0);
    const rowW =
      footerLogos.reduce((sum, logo) => sum + logo.w, 0) +
      logoGap * Math.max(0, footerLogos.length - 1);

    const padTop = 14;
    const padBot = 18;
    const logosBlock = footerLogos.length ? 12 + rowH : 0;
    const footerTop =
      padTop + discLines.length * discLh + logosBlock + padBot;

    page.drawRectangle({
      x: 0,
      y: 0,
      width,
      height: footerTop,
      color: WASH,
    });
    page.drawRectangle({
      x: 0,
      y: footerTop,
      width,
      height: 2,
      color: VIOLET,
    });

    let footerY = footerTop - padTop;
    for (const line of discLines) {
      footerY -= discSize;
      page.drawText(line, {
        x: margin,
        y: footerY,
        size: discSize,
        font: regular,
        color: MUTED,
      });
      footerY -= discLh - discSize;
    }

    if (footerLogos.length) {
      let x = (width - rowW) / 2;
      const y = padBot;
      for (const logo of footerLogos) {
        page.drawImage(logo.img, {
          x,
          y: y + (rowH - logo.h) / 2,
          width: logo.w,
          height: logo.h,
        });
        x += logo.w + logoGap;
      }
    }
  }

  return Buffer.from(await doc.save());
}

function drawOptionBlock(
  page: PDFPage,
  block: TicketOptionBlock,
  opts: {
    x: number;
    y: number;
    width: number;
    bold: PDFFont;
    regular: PDFFont;
  },
): number {
  const lines = [
    block.heading,
    block.date,
    ...block.trips.map((trip) => `• ${trip}`),
    ...(block.total ? [block.total] : []),
  ].filter(Boolean);
  const lineH = 13;
  const pad = 10;
  const height = pad * 2 + lines.length * lineH;
  let y = opts.y;

  page.drawRectangle({
    x: opts.x,
    y: y - height + 8,
    width: opts.width,
    height,
    color: WASH,
  });
  page.drawRectangle({
    x: opts.x,
    y: y - height + 8,
    width: 3,
    height,
    color: VIOLET,
  });

  y -= 4;
  for (const [index, line] of lines.entries()) {
    page.drawText(pdfSafe(line), {
      x: opts.x + 12,
      y: y - 8,
      size: index === 0 ? 10 : 9,
      font: index === 0 || index === lines.length - 1 ? opts.bold : opts.regular,
      color: INK,
    });
    y -= lineH;
  }
  return y - 4;
}

function embedImage(doc: PDFDocument, bytes: Buffer, url?: string) {
  const jpeg =
    bytes[0] === 0xff && bytes[1] === 0xd8
      ? true
      : (url?.toLowerCase().endsWith(".jpg") ||
          url?.toLowerCase().endsWith(".jpeg")) ??
        false;
  if (jpeg) return doc.embedJpg(bytes);
  return doc.embedPng(bytes);
}

function drawFact(
  page: PDFPage,
  label: string,
  value: string,
  opts: {
    x: number;
    y: number;
    width: number;
    bold: PDFFont;
  },
): number {
  page.drawText(pdfSafe(label), {
    x: opts.x,
    y: opts.y,
    size: 7.5,
    font: opts.bold,
    color: MUTED,
  });
  const bottom = drawWrapped(page, pdfSafe(value), {
    x: opts.x,
    y: opts.y - 13,
    maxWidth: opts.width,
    size: 11,
    font: opts.bold,
    color: INK,
    lineHeight: 13,
  });
  return opts.y - bottom;
}

function wrapLines(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawWrapped(
  page: PDFPage,
  text: string,
  opts: {
    x: number;
    y: number;
    maxWidth: number;
    size: number;
    font: PDFFont;
    color: ReturnType<typeof rgb>;
    lineHeight: number;
  },
): number {
  let y = opts.y;
  for (const line of wrapLines(text, opts.font, opts.size, opts.maxWidth)) {
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
      address: "ADRESSE",
      start: "DÉBUT",
      doors: "PORTES",
      price: "PRIX",
      tariff: "TARIF",
      holder: "TITULAIRE",
      place: "PLACE",
      order: "COMMANDE",
      practical:
        "En cas d'arrivée après le début, l'accès n'est plus garanti.",
      disclaimer:
        "Ce billet ne peut être ni annulé, ni repris, ni échangé, ni remboursé. Il est interdit de présenter plusieurs exemplaires d'un même billet à l'entrée d'une manifestation, de modifier le billet ou de l'imiter. Conditions générales : ticketick.ch/terms",
      unpaid: "NON VALABLE — paiement en attente",
      unpaidShort: "NON VALABLE",
    },
    en: {
      nOf: (n: number, total: number) => `Ticket ${n} / ${total}`,
      address: "ADDRESS",
      start: "STARTS",
      doors: "DOORS",
      price: "PRICE",
      tariff: "TARIFF",
      holder: "HOLDER",
      place: "SEAT",
      order: "ORDER",
      practical: "Admission after the start is no longer guaranteed.",
      disclaimer:
        "This ticket cannot be cancelled, taken back, exchanged or refunded. Presenting several copies of the same ticket, altering or counterfeiting it is forbidden. Terms: ticketick.ch/terms",
      unpaid: "NOT VALID — payment pending",
      unpaidShort: "NOT VALID",
    },
    de: {
      nOf: (n: number, total: number) => `Ticket ${n} / ${total}`,
      address: "ADRESSE",
      start: "BEGINN",
      doors: "TÜREN",
      price: "PREIS",
      tariff: "TARIF",
      holder: "INHABER",
      place: "PLATZ",
      order: "BESTELLUNG",
      practical:
        "Bei Ankunft nach Beginn ist der Einlass nicht mehr garantiert.",
      disclaimer:
        "Dieses Ticket kann weder storniert, zurückgenommen, umgetauscht noch erstattet werden. Mehrere Exemplare desselben Tickets vorzuzeigen, es zu ändern oder nachzumachen ist verboten. AGB: ticketick.ch/terms",
      unpaid: "UNGULTIG — Zahlung ausstehend",
      unpaidShort: "UNGULTIG",
    },
    it: {
      nOf: (n: number, total: number) => `Biglietto ${n} / ${total}`,
      address: "INDIRIZZO",
      start: "INIZIO",
      doors: "PORTE",
      price: "PREZZO",
      tariff: "TARIFFA",
      holder: "INTESTATARIO",
      place: "POSTO",
      order: "ORDINE",
      practical:
        "In caso di arrivo dopo l'inizio, l'accesso non è più garantito.",
      disclaimer:
        "Questo biglietto non può essere annullato, ripreso, cambiato o rimborsato. È vietato presentare più copie dello stesso biglietto, modificarlo o imitarlo. Condizioni: ticketick.ch/terms",
      unpaid: "NON VALIDO — pagamento in attesa",
      unpaidShort: "NON VALIDO",
    },
  } as const;
  return pack[locale as keyof typeof pack] ?? pack.fr;
}
