import "server-only";

import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
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
const ALERT = rgb(0.75, 0.16, 0.18);

/** Largeur A6 : lisible sur un téléphone sans zoomer, imprimable tel quel. */
const PAGE_W = 297.64;
/** Hauteur du premier tracé, qui mesure le billet avant de le dessiner à sa taille. */
const DRAFT_H = 3000;
const ON_VIOLET = rgb(1, 1, 1);

export async function buildTicketsPdf(
  tickets: TicketPdfCard[],
  locale: string,
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const copy = labels(locale);
  const total = tickets.length;
  const images = new Map<string, Promise<PDFImage>>();
  const image = (bytes: Buffer, url = "") => {
    let hit = images.get(url);
    if (!hit) {
      hit = embedImage(doc, bytes, url);
      images.set(url, hit);
    }
    return hit;
  };
  const qr = async (code: string) => {
    const key = `qr:${code}`;
    let hit = images.get(key);
    if (!hit) {
      hit = ticketQrPng(code).then((png) => doc.embedPng(png));
      images.set(key, hit);
    }
    return hit;
  };

  const ctx: DrawContext = { regular, bold, italic, copy, total, image, qr };

  for (const [index, ticket] of tickets.entries()) {
    const draft = doc.addPage([PAGE_W, DRAFT_H]);
    const bottom = await drawTicket(draft, DRAFT_H, ticket, index, ctx);
    doc.removePage(doc.getPageCount() - 1);
    const pageH = DRAFT_H - bottom;
    await drawTicket(doc.addPage([PAGE_W, pageH]), pageH, ticket, index, ctx);
  }

  return Buffer.from(await doc.save());
}

type DrawContext = {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  copy: ReturnType<typeof labels>;
  total: number;
  image: (bytes: Buffer, url?: string) => Promise<PDFImage>;
  qr: (code: string) => Promise<PDFImage>;
};

async function drawTicket(
  page: PDFPage,
  pageH: number,
  ticket: TicketPdfCard,
  index: number,
  ctx: DrawContext,
): Promise<number> {
const { regular, bold, italic, copy, total } = ctx;
  const width = PAGE_W;
  const margin = 20;
  const contentW = width - margin * 2;
  let y = pageH - margin;

  page.drawRectangle({ x: 0, y: 0, width, height: pageH, color: PAPER });

  const nOf = pdfSafe(copy.nOf(index + 1, total));
  const nOfW = regular.widthOfTextAtSize(nOf, 8);
  page.drawText(nOf, {
    x: width - margin - nOfW,
    y: y - 8,
    size: 8,
    font: regular,
    color: MUTED,
  });

  const logoBytes = await readPublicFile(ticket.organizerLogoUrl);
  let headerH = 14;
  if (logoBytes) {
    const logo = await ctx.image(logoBytes, ticket.organizerLogoUrl);
    const logoH = 32;
    const logoW = Math.min((logo.width / logo.height) * logoH, contentW - nOfW - 12);
    page.drawImage(logo, {
      x: margin,
      y: y - logoH,
      width: logoW,
      height: (logoW / logo.width) * logo.height,
    });
    headerH = logoH;
  } else if (ticket.organizerName) {
    drawWrapped(page, pdfSafe(ticket.organizerName), {
      x: margin,
      y: y - 11,
      maxWidth: contentW - nOfW - 12,
      size: 11,
      font: bold,
      color: INK,
      lineHeight: 13,
    });
  }
  y -= headerH + 10;

  if (!ticket.valid) {
    const banner = pdfSafe(copy.unpaid);
    page.drawRectangle({
      x: margin,
      y: y - 18,
      width: contentW,
      height: 18,
      color: ALERT,
    });
    page.drawText(banner, {
      x: margin + (contentW - bold.widthOfTextAtSize(banner, 8)) / 2,
      y: y - 12,
      size: 8,
      font: bold,
      color: PAPER,
    });
    y -= 26;
  }

  page.drawRectangle({ x: margin, y: y - 2, width: contentW, height: 2, color: VIOLET });
  y -= 18;

  if (logoBytes && ticket.organizerName) {
    y = drawWrapped(page, pdfSafe(ticket.organizerName.toUpperCase()), {
      x: margin,
      y,
      maxWidth: contentW,
      size: 7,
      font: bold,
      color: VIOLET,
      lineHeight: 10,
    });
    y -= 6;
  }

  y = drawWrapped(page, pdfSafe(ticket.eventTitle), {
    x: margin,
    y: y - 4,
    maxWidth: contentW,
    size: 15,
    font: bold,
    color: INK,
    lineHeight: 18,
  });
  if (ticket.eventSubtitle) {
    y = drawWrapped(page, pdfSafe(ticket.eventSubtitle), {
      x: margin,
      y: y + 2,
      maxWidth: contentW,
      size: 11,
      font: italic,
      color: INK,
      lineHeight: 14,
    });
  }

  y = drawKeyBanner(page, ticket, copy, {
    x: margin,
    y: y - 6,
    width: contentW,
    bold,
    regular,
  });

  if (ticket.note) {
    const noteLines = wrapLines(pdfSafe(ticket.note), bold, 10, contentW - 20);
    const boxH = 10 + noteLines.length * 13;
    y -= 10 + boxH;
    page.drawRectangle({ x: margin, y, width: contentW, height: boxH, color: WASH });
    page.drawRectangle({ x: margin, y, width: 3, height: boxH, color: VIOLET });
    let ny = y + boxH - 5 - 9;
    for (const line of noteLines) {
      page.drawText(line, { x: margin + 12, y: ny, size: 10, font: bold, color: INK });
      ny -= 13;
    }
  }

  const qr = await ctx.qr(ticket.code);
  const qrSize = 168;
  y -= 14 + qrSize;
  page.drawImage(qr, {
    x: (width - qrSize) / 2,
    y,
    width: qrSize,
    height: qrSize,
  });
  y -= 12;
  page.drawText(ticket.code, {
    x: (width - bold.widthOfTextAtSize(ticket.code, 9)) / 2,
    y,
    size: 9,
    font: bold,
    color: INK,
  });
  if (!ticket.valid) {
    const stamp = pdfSafe(copy.unpaidShort);
    y -= 12;
    page.drawText(stamp, {
      x: (width - bold.widthOfTextAtSize(stamp, 8)) / 2,
      y,
      size: 8,
      font: bold,
      color: ALERT,
    });
  }

  y -= 14;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.75,
    color: RULE,
  });
  y -= 14;

  const pairs = (
    [
      [copy.tariff, ticket.ticketName],
      [copy.price, ticket.priceLabel],
      [copy.holder, ticket.holderName],
      [copy.order, ticket.reference],
    ] as [string, string][]
  ).filter(([, value]) => value.trim());

  const colGap = 12;
  const colW = (contentW - colGap) / 2;
  for (let i = 0; i < pairs.length; i += 2) {
    const left = pairs[i];
    const right = pairs[i + 1];
    const leftH = drawFact(page, left[0], left[1], {
      x: margin,
      y,
      width: colW,
      bold,
    });
    const rightH = right
      ? drawFact(page, right[0], right[1], {
          x: margin + colW + colGap,
          y,
          width: colW,
          bold,
        })
      : 0;
    y -= Math.max(leftH, rightH) + 8;
  }

  if (ticket.venueLines.length) {
    y -= 2;
    page.drawText(pdfSafe(copy.address), {
      x: margin,
      y,
      size: 6.5,
      font: bold,
      color: MUTED,
    });
    y -= 12;
    for (const line of ticket.venueLines) {
      y = drawWrapped(page, pdfSafe(line), {
        x: margin,
        y,
        maxWidth: contentW,
        size: 10,
        font: regular,
        color: INK,
        lineHeight: 12.5,
      });
    }
  }

  y -= 4;
  y = drawWrapped(page, pdfSafe(copy.practical), {
    x: margin,
    y,
    maxWidth: contentW,
    size: 8.5,
    font: regular,
    color: INK,
    lineHeight: 11,
  });

  if (ticket.optionBlocks?.length) {
    y -= 8;
    for (const block of ticket.optionBlocks) {
      y = drawOptionBlock(page, block, {
        x: margin,
        y,
        width: contentW,
        bold,
        regular,
      });
      y -= 8;
    }
  }

  if (ticket.contractor) {
    y -= 6;
    page.drawText(pdfSafe(copy.contractor), {
      x: margin,
      y,
      size: 6.5,
      font: bold,
      color: MUTED,
    });
    y = drawWrapped(page, pdfSafe(ticket.contractor), {
      x: margin,
      y: y - 12,
      maxWidth: contentW,
      size: 9.5,
      font: bold,
      color: INK,
      lineHeight: 12,
    });
  }

  const disclaimer = pdfSafe(ticket.disclaimer ?? copy.disclaimer);
  const discSize = 6.5;
  const discLh = 8.5;
  const discLines = wrapLines(disclaimer, regular, discSize, contentW);

  const footerLogos: { img: Awaited<ReturnType<typeof embedImage>>; w: number; h: number }[] =
    [];
  const brandBytes = await readPublicFile("/brand/ticketick-logo-small.png");
  if (brandBytes) {
    const img = await ctx.image(brandBytes, "/brand/ticketick-logo-small.png");
    const h = 11;
    footerLogos.push({ img, h, w: (img.width / img.height) * h });
  }
  const producerBytes = await readPublicFile(ticket.producerLogoUrl);
  if (producerBytes && ticket.producerLogoUrl) {
    const img = await ctx.image(producerBytes, ticket.producerLogoUrl);
    const h = 26;
    footerLogos.push({
      img,
      h,
      w: Math.min((img.width / img.height) * h, 100),
    });
  }

  const logoGap = 16;
  const rowH = footerLogos.reduce((max, logo) => Math.max(max, logo.h), 0);
  const rowW =
    footerLogos.reduce((sum, logo) => sum + logo.w, 0) +
    logoGap * Math.max(0, footerLogos.length - 1);

  const padTop = 12;
  const padBot = 14;
  const logosBlock = footerLogos.length ? 10 + rowH : 0;
  const footerH = padTop + discLines.length * discLh + logosBlock + padBot;
  const footerTop = y - 10;
  const bottom = footerTop - footerH;

  page.drawRectangle({ x: 0, y: bottom, width, height: footerH, color: WASH });
  page.drawRectangle({ x: 0, y: footerTop, width, height: 1.5, color: VIOLET });

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
    for (const logo of footerLogos) {
      page.drawImage(logo.img, {
        x,
        y: bottom + padBot + (rowH - logo.h) / 2,
        width: logo.w,
        height: logo.h,
      });
      x += logo.w + logoGap;
    }
  }

  return bottom;
}

/** Bandeau violet : date, heure, ouverture des portes, place et visibilité. */
function drawKeyBanner(
  page: PDFPage,
  ticket: TicketPdfCard,
  copy: ReturnType<typeof labels>,
  opts: { x: number; y: number; width: number; bold: PDFFont; regular: PDFFont },
): number {
  const { bold, regular } = opts;
  const pad = 12;
  const innerW = opts.width - pad * 2;
  const time = pdfSafe(ticket.startTime);
  const timeSize = 22;
  const timeW = bold.widthOfTextAtSize(time, timeSize);
  const dayLines = wrapLines(pdfSafe(ticket.day), bold, 11.5, innerW - timeW - 12);
  const doors = ticket.doorsTime ? pdfSafe(copy.doorsAt(ticket.doorsTime)) : "";
  const placeLines = wrapLines(pdfSafe(ticket.seatPlace), bold, 15, innerW);
  const view = ticket.seatView ? pdfSafe(ticket.seatView) : "";

  const dateBlock = Math.max(10 + dayLines.length * 14, 10 + timeSize);
  const doorsBlock = doors ? 13 : 0;
  const placeBlock = 10 + placeLines.length * 18;
  const viewBlock = view ? 20 : 0;
  const height = pad + dateBlock + doorsBlock + 12 + placeBlock + viewBlock + pad - 4;
  const top = opts.y;
  const left = opts.x + pad;

  page.drawRectangle({
    x: opts.x,
    y: top - height,
    width: opts.width,
    height,
    color: VIOLET,
  });

  let y = top - pad - 6;
  page.drawText(pdfSafe(copy.date), { x: left, y, size: 6.5, font: bold, color: ON_VIOLET });
  const startLabel = pdfSafe(copy.start);
  page.drawText(startLabel, {
    x: left + innerW - bold.widthOfTextAtSize(startLabel, 6.5),
    y,
    size: 6.5,
    font: bold,
    color: ON_VIOLET,
  });
  page.drawText(time, {
    x: left + innerW - timeW,
    y: y - 4 - timeSize * 0.72,
    size: timeSize,
    font: bold,
    color: ON_VIOLET,
  });
  let dy = y - 4 - 11.5 * 0.72 - 2;
  for (const line of dayLines) {
    page.drawText(line, { x: left, y: dy, size: 11.5, font: bold, color: ON_VIOLET });
    dy -= 14;
  }
  y -= dateBlock;

  if (doors) {
    page.drawText(doors, { x: left, y: y + 1, size: 8.5, font: regular, color: ON_VIOLET });
    y -= doorsBlock;
  }

  page.drawLine({
    start: { x: left, y: y + 4 },
    end: { x: left + innerW, y: y + 4 },
    thickness: 0.6,
    color: ON_VIOLET,
    opacity: 0.45,
  });
  y -= 8;

  page.drawText(pdfSafe(copy.place), { x: left, y, size: 6.5, font: bold, color: ON_VIOLET });
  y -= 4 + 15 * 0.72 + 2;
  for (const line of placeLines) {
    page.drawText(line, { x: left, y, size: 15, font: bold, color: ON_VIOLET });
    y -= 18;
  }

  if (view) {
    const viewW = bold.widthOfTextAtSize(view, 8.5) + 14;
    page.drawRectangle({ x: left, y: y - 3, width: viewW, height: 15, color: PAPER });
    page.drawText(view, { x: left + 7, y: y + 1.5, size: 8.5, font: bold, color: VIOLET });
  }

  return top - height;
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
    size: 6.5,
    font: opts.bold,
    color: MUTED,
  });
  const bottom = drawWrapped(page, pdfSafe(value), {
    x: opts.x,
    y: opts.y - 12,
    maxWidth: opts.width,
    size: 10,
    font: opts.bold,
    color: INK,
    lineHeight: 12,
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
      date: "DATE",
      doorsAt: (time: string) => `Ouverture des portes ${time}`,
      contractor: "ORGANISATEUR ET CONTRACTANT",
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
      date: "DATE",
      doorsAt: (time: string) => `Doors open ${time}`,
      contractor: "ORGANISER AND CONTRACTING PARTY",
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
      date: "DATUM",
      doorsAt: (time: string) => `Türöffnung ${time}`,
      contractor: "VERANSTALTER UND VERTRAGSPARTNER",
      price: "PREIS",
      tariff: "TARIF",
      holder: "INHABER",
      place: "PLATZ",
      order: "BESTELLUNG",
      practical:
        "Bei Ankunft nach Beginn ist der Einlass nicht mehr garantiert.",
      disclaimer:
        "Dieses Ticket kann weder storniert, zurückgenommen, umgetauscht noch erstattet werden. Mehrere Exemplare desselben Tickets vorzuzeigen, es zu ändern oder nachzumachen ist verboten. AGB: ticketick.ch/terms",
      unpaid: "UNGÜLTIG — Zahlung ausstehend",
      unpaidShort: "UNGÜLTIG",
    },
    it: {
      nOf: (n: number, total: number) => `Biglietto ${n} / ${total}`,
      address: "INDIRIZZO",
      start: "INIZIO",
      date: "DATA",
      doorsAt: (time: string) => `Apertura porte ${time}`,
      contractor: "ORGANIZZATORE E CONTRAENTE",
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
    es: {
      nOf: (n: number, total: number) => `Entrada ${n} / ${total}`,
      address: "DIRECCIÓN",
      start: "INICIO",
      date: "FECHA",
      doorsAt: (time: string) => `Apertura de puertas ${time}`,
      contractor: "ORGANIZADOR Y PARTE CONTRATANTE",
      price: "PRECIO",
      tariff: "TARIFA",
      holder: "TITULAR",
      place: "ASIENTO",
      order: "PEDIDO",
      practical:
        "Si llegas después del inicio, el acceso ya no está garantizado.",
      disclaimer:
        "Esta entrada no se puede anular, devolver, cambiar ni reembolsar. Está prohibido presentar varias copias de una misma entrada, modificarla o imitarla. Condiciones: ticketick.ch/terms",
      unpaid: "NO VÁLIDA — pago pendiente",
      unpaidShort: "NO VÁLIDA",
    },
  } as const;
  return pack[locale as keyof typeof pack] ?? pack.fr;
}
