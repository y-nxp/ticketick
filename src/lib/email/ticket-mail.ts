import "server-only";

import { envoyer, echapper, type MailAttachment } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { publicAppOrigin } from "@/lib/app-url";
import { ticketQrPng } from "@/lib/tickets/qr";
import { buildTicketsPdf } from "@/lib/tickets/pdf";
import { ticketPdfPath } from "@/lib/tickets/download";

export interface TicketForMail {
  code: string;
  eventTitle: string;
  ticketName: string;
  when: string;
  venue: string;
  organizerName?: string;
  holderName?: string;
}

export async function sendTicketCards(input: {
  to: string;
  bcc?: string[];
  firstName: string;
  reference: string;
  locale: string;
  tickets: TicketForMail[];
  preview?: boolean;
}) {
  const attachments: MailAttachment[] = await Promise.all(
    input.tickets.map(async (ticket, index) => ({
      filename: `billet-${index + 1}.png`,
      content: await ticketQrPng(ticket.code),
      cid: `qr-${index}`,
      contentType: "image/png",
    })),
  );

  const pdfCards = input.tickets.map((ticket) => ({
    code: ticket.code,
    eventTitle: ticket.eventTitle,
    organizerName: ticket.organizerName,
    ticketName: ticket.ticketName,
    when: ticket.when,
    venue: ticket.venue,
    holderName: ticket.holderName || input.firstName,
    reference: input.reference,
  }));
  attachments.push({
    filename: `billets-${input.reference}.pdf`,
    content: await buildTicketsPdf(pdfCards, input.locale),
    contentType: "application/pdf",
  });

  const t = textes(input.locale);
  const titre = input.preview ? t.apercuSujet : t.sujet(input.reference);

  const cartes = input.tickets
    .map((ticket, index) => carteHtml(ticket, `qr-${index}`))
    .join("");

  const html = `<!DOCTYPE html>
<html lang="${echapper(input.locale)}">
<body style="margin:0;padding:24px;background:#F8F9FA;font-family:Inter,system-ui,sans-serif;color:#2A2C30">
  <div style="max-width:560px;margin:0 auto">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#6C5CE7;font-weight:800">ticketick</p>
    <h1 style="margin:0 0 16px;font-size:22px">${echapper(titre)}</h1>
    <p style="margin:0 0 24px;line-height:1.5">${echapper(t.bonjour(input.firstName))} ${echapper(input.preview ? t.apercuCorps : t.corps)} ${echapper(t.pdf)}</p>
    ${
      input.preview
        ? ""
        : `<p style="margin:0 0 24px"><a href="${echapper(publicAppOrigin() + ticketPdfPath(input.reference))}" style="color:#6C5CE7;font-weight:600">${echapper(t.pdfLien)}</a></p>`
    }
    ${cartes}
    <p style="margin:24px 0 0;font-size:12px;color:#6b7280">${echapper(t.pied)}</p>
  </div>
</body>
</html>`;

  const text = [
    t.bonjour(input.firstName),
    "",
    input.preview ? t.apercuCorps : t.corps,
    "",
    ...input.tickets.flatMap((ticket) => [
      ticket.eventTitle,
      ticket.ticketName,
      ticket.when,
      ticket.venue,
      ticket.code,
      "",
    ]),
    "ticketick.ch",
  ].join("\n");

  return envoyer({
    to: input.to,
    bcc: input.bcc,
    subject: titre,
    text,
    html,
    attachments,
    etiquette: input.preview ? "aperçu billet" : "billets",
  });
}

/** Envoie les billets d'une commande payée, avec copie à l'organisateur. */
export async function sendPaidOrderTickets(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      email: true,
      firstName: true,
      lastName: true,
      reference: true,
      locale: true,
      tickets: {
        orderBy: { createdAt: "asc" },
        select: {
          code: true,
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
                      organizer: { select: { name: true, notifyEmails: true } },
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

  if (!order || order.tickets.length === 0) return;

  const tickets = order.tickets.map((ticket) => {
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
      holderName: `${order.firstName} ${order.lastName}`.trim(),
    };
  });

  const copies = [
    ...new Set(
      order.tickets.flatMap(
        (ticket) => ticket.ticketType.session.event.organizer.notifyEmails,
      ),
    ),
  ].filter((adresse) => adresse !== order.email);

  await sendTicketCards({
    to: order.email,
    bcc: copies,
    firstName: order.firstName,
    reference: order.reference,
    locale: order.locale,
    tickets,
  });
}

export async function sendPreviewTicketEmail(to: string) {
  return sendTicketCards({
    to,
    firstName: "Yann",
    reference: "APERCU-DEMO",
    locale: "fr",
    preview: true,
    tickets: [
      {
        code: "APERCU-DEMO-0001",
        eventTitle: "Beethoven — Messe en ut & Fantaisie chorale",
        organizerName: "Chœur Cantabile",
        ticketName: "Plein tarif",
        when: "dimanche 15 novembre 2026, 17:00",
        venue: "Abbaye de Bonmont, Chéserex",
        holderName: "Yann",
      },
      {
        code: "APERCU-DEMO-0002",
        eventTitle: "Beethoven — Messe en ut & Fantaisie chorale",
        organizerName: "Chœur Cantabile",
        ticketName: "Gratuit — jusqu’à 16 ans",
        when: "dimanche 15 novembre 2026, 17:00",
        venue: "Abbaye de Bonmont, Chéserex",
        holderName: "Yann",
      },
    ],
  });
}

function carteHtml(ticket: TicketForMail, cid: string): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:16px;background:#fff">
  <tr>
    <td style="padding:20px 20px 8px">
      <p style="margin:0 0 4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6C5CE7;font-weight:700">Billet</p>
      <p style="margin:0 0 8px;font-size:18px;font-weight:800;line-height:1.3">${echapper(ticket.eventTitle)}</p>
      <p style="margin:0;font-size:14px">${echapper(ticket.ticketName)}</p>
      <p style="margin:8px 0 0;font-size:13px;color:#4b5563">${echapper(ticket.when)}<br>${echapper(ticket.venue)}</p>
    </td>
  </tr>
  <tr>
    <td align="center" style="padding:8px 20px 20px">
      <img src="cid:${cid}" width="200" height="200" alt="${echapper(ticket.code)}" style="display:block;width:200px;height:200px;border:0"/>
      <p style="margin:8px 0 0;font-family:ui-monospace,monospace;font-size:13px;letter-spacing:.06em">${echapper(ticket.code)}</p>
    </td>
  </tr>
</table>`;
}

function textes(locale: string) {
  const pack = {
    fr: {
      sujet: (ref: string) => `Vos billets — ${ref}`,
      apercuSujet: "Aperçu — billet ticketick",
      bonjour: (prenom: string) => `Bonjour ${prenom},`,
      corps: "Présentez le QR à l’entrée. Chaque billet n’est valable qu’une fois.",
      pdf: "Un PDF imprimable est joint (un billet par page, numéroté).",
      pdfLien: "Télécharger / imprimer le PDF",
      apercuCorps:
        "Ceci est un aperçu : le QR n’ouvre aucune porte. Voici le rendu envoyé à l’acheteur.",
      pied: "ticketick.ch — billetterie suisse",
    },
    en: {
      sujet: (ref: string) => `Your tickets — ${ref}`,
      apercuSujet: "Preview — ticketick ticket",
      bonjour: (prenom: string) => `Hello ${prenom},`,
      corps: "Show the QR code at the entrance. Each ticket is valid once.",
      pdf: "A printable PDF is attached (one numbered ticket per page).",
      pdfLien: "Download / print the PDF",
      apercuCorps:
        "This is a preview: the QR code will not admit anyone. This is what the buyer receives.",
      pied: "ticketick.ch — Swiss ticketing",
    },
    de: {
      sujet: (ref: string) => `Ihre Tickets — ${ref}`,
      apercuSujet: "Vorschau — ticketick-Ticket",
      bonjour: (prenom: string) => `Guten Tag ${prenom},`,
      corps: "Zeigen Sie den QR-Code am Eingang. Jedes Ticket gilt nur einmal.",
      pdf: "Ein druckbares PDF ist angehängt (ein nummeriertes Ticket pro Seite).",
      pdfLien: "PDF herunterladen / drucken",
      apercuCorps:
        "Dies ist eine Vorschau: Der QR-Code öffnet keine Tür. So sieht die Nachricht an die Käuferin oder den Käufer aus.",
      pied: "ticketick.ch — Schweizer Ticketing",
    },
    it: {
      sujet: (ref: string) => `I tuoi biglietti — ${ref}`,
      apercuSujet: "Anteprima — biglietto ticketick",
      bonjour: (prenom: string) => `Buongiorno ${prenom},`,
      corps: "Mostra il QR all’ingresso. Ogni biglietto è valido una sola volta.",
      pdf: "In allegato un PDF da stampare (un biglietto numerato per pagina).",
      pdfLien: "Scarica / stampa il PDF",
      apercuCorps:
        "Questa è un’anteprima: il QR non apre nessun ingresso. Ecco cosa riceve chi acquista.",
      pied: "ticketick.ch — biglietteria svizzera",
    },
  } as const;
  return pack[locale as keyof typeof pack] ?? pack.fr;
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
