import "server-only";

import { envoyer, echapper, type MailAttachment } from "@/lib/email";
import { byLocale } from "@/lib/i18n-fallback";
import { publicAppOrigin } from "@/lib/app-url";
import { ticketQrPng } from "@/lib/tickets/qr";
import { buildTicketsPdf } from "@/lib/tickets/pdf";
import { paidOrderForMail, ticketPdfPath } from "@/lib/tickets/download";
import {
  formatTicketPrice,
  readPublicFile,
  toTicketCard,
  type TicketCard,
} from "@/lib/tickets/payload";
import type { SeatView } from "@/lib/seating/layout";

const VIEW_CONTACT = "ticket@ticketick.ch";

export async function sendTicketCards(input: {
  to: string;
  bcc?: string[];
  buyerName: string;
  reference: string;
  locale: string;
  tickets: TicketCard[];
  preview?: boolean;
  /** Renvoi annonçant des places à visibilité réduite, avec l'adresse pour en changer. */
  viewNotice?: SeatView[];
}) {
  const attachments: MailAttachment[] = await Promise.all(
    input.tickets.map(async (ticket, index) => ({
      filename: `billet-${index + 1}.png`,
      content: await ticketQrPng(ticket.code),
      cid: `qr-${index}`,
      contentType: "image/png",
    })),
  );

  const logoUrl = input.tickets[0]?.organizerLogoUrl;
  const logo = await readPublicFile(logoUrl);
  if (logo && logoUrl) {
    attachments.push({
      filename: "organisateur.png",
      content: logo,
      cid: "org-logo",
      contentType: logoUrl.endsWith(".jpg") ? "image/jpeg" : "image/png",
    });
  }

  const brandLogo = await readPublicFile("/brand/ticketick-logo-small.png");
  if (brandLogo) {
    attachments.push({
      filename: "ticketick.png",
      content: brandLogo,
      cid: "ticketick-logo",
      contentType: "image/png",
    });
  }

  const producerLogoUrl = input.tickets[0]?.producerLogoUrl;
  const producerLogo = await readPublicFile(producerLogoUrl);
  if (producerLogo && producerLogoUrl) {
    attachments.push({
      filename: "responsable.png",
      content: producerLogo,
      cid: "producer-logo",
      contentType: producerLogoUrl.endsWith(".jpg") ? "image/jpeg" : "image/png",
    });
  }

  attachments.push({
    filename: `billets-${input.reference}.pdf`,
    content: await buildTicketsPdf(input.tickets, input.locale),
    contentType: "application/pdf",
  });

  const t = textes(input.locale);
  const views = new Set(input.viewNotice ?? []);
  const vue =
    views.size === 0
      ? null
      : views.size > 1
        ? t.vueMixte
        : views.has("none")
          ? t.vueAucune
          : t.vuePartielle;
  const titre = input.preview ? t.apercuSujet : vue ? t.vueSujet : t.sujet;
  const totalCents = input.tickets.reduce((sum, ticket) => sum + ticket.priceCents, 0);
  const totalLabel = formatTicketPrice(totalCents, input.locale);
  const downloadHref = `${publicAppOrigin()}${ticketPdfPath(input.reference)}`;

  const recapRows = input.tickets
    .map(
      (ticket) => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;vertical-align:top">
          <p style="margin:0;font-weight:700">${echapper(ticket.eventTitle)}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#4b5563">${echapper(ticket.when)}<br>${echapper(ticket.venueInline)}</p>
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top">${echapper(ticket.ticketName)}</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;vertical-align:top;text-align:right;white-space:nowrap;font-weight:600">${echapper(ticket.priceLabel)}</td>
      </tr>`,
    )
    .join("");

  const cartes = input.tickets
    .map((ticket, index) => carteHtml(ticket, `qr-${index}`, t, Boolean(logo)))
    .join("");

  const html = `<!DOCTYPE html>
<html lang="${echapper(input.locale)}">
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:24px;background:#F8F9FA;font-family:Inter,system-ui,sans-serif;color:#2A2C30">
  <div style="max-width:600px;margin:0 auto">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#6C5CE7;font-weight:800">ticketick</p>
    <h1 style="margin:0 0 8px;font-size:22px">${echapper(titre)}</h1>
    <p style="margin:0 0 20px;font-size:14px;color:#4b5563">${echapper(t.reference)} ${echapper(input.reference)}</p>
    <p style="margin:0 0 8px;line-height:1.5">${echapper(t.bonjour(input.buyerName))}</p>
    ${
      vue
        ? `<div style="margin:0 0 20px;padding:14px 16px;background:#fff;border:1px solid #e5e7eb;border-left:4px solid #6C5CE7;border-radius:0 8px 8px 0">
      <p style="margin:0 0 6px;font-weight:700">${echapper(t.vueTitre)}</p>
      <p style="margin:0 0 6px;line-height:1.5">${echapper(vue)}</p>
      <p style="margin:0;line-height:1.5">${echapper(t.vueChangement)} <a href="mailto:${VIEW_CONTACT}" style="color:#6C5CE7;font-weight:700">${VIEW_CONTACT}</a>${echapper(t.vueReference(input.reference))}</p>
    </div>`
        : ""
    }
    <p style="margin:0 0 20px;line-height:1.5">${echapper(input.preview ? t.apercuCorps : t.corps)}</p>
    ${
      input.preview
        ? ""
        : `<p style="margin:0 0 28px"><a href="${echapper(downloadHref)}" style="display:inline-block;background:#6C5CE7;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px">${echapper(t.pdfLien)}</a></p>`
    }
    <h2 style="margin:0 0 8px;font-size:16px">${echapper(t.recap)}</h2>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;border-collapse:collapse">
      <tr>
        <th align="left" style="padding:0 0 8px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280">${echapper(t.colPlace)}</th>
        <th align="left" style="padding:0 8px 8px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280">${echapper(t.colTarif)}</th>
        <th align="right" style="padding:0 0 8px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280">${echapper(t.colPrix)}</th>
      </tr>
      ${recapRows}
      <tr>
        <td colspan="2" style="padding:12px 0 0;font-weight:800">${echapper(t.total)}</td>
        <td style="padding:12px 0 0;text-align:right;font-weight:800">${echapper(totalLabel)}</td>
      </tr>
    </table>
    ${cartes}
    <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#6b7280">${echapper(input.tickets[0]?.disclaimer ?? t.disclaimer)}</p>
    ${footerLogosHtml(input.tickets[0], Boolean(brandLogo), Boolean(producerLogo))}
    <p style="margin:16px 0 0;font-size:13px;line-height:1.5">${echapper(t.salutations)}<br>${echapper(t.pied)}</p>
  </div>
</body>
</html>`;

  const text = [
    t.bonjour(input.buyerName),
    "",
    `${t.reference} ${input.reference}`,
    "",
    ...(vue
      ? [
          t.vueTitre,
          vue,
          `${t.vueChangement} ${VIEW_CONTACT}${t.vueReference(input.reference)}`,
          "",
        ]
      : []),
    input.preview ? t.apercuCorps : t.corps,
    "",
    t.recap,
    ...input.tickets.flatMap((ticket) => [
      `${ticket.eventTitle} — ${ticket.ticketName} — ${ticket.priceLabel}`,
      ticket.when,
      ticket.venueInline,
      ticket.holderName,
      ticket.seating,
      ticket.code,
      "",
    ]),
    `${t.total} ${totalLabel}`,
    "",
    input.tickets[0]?.disclaimer ?? t.disclaimer,
    "",
    t.pied,
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

/**
 * Envoie les billets valables d'une commande payée, avec copie à
 * l'organisateur sauf au renvoi depuis l'admin.
 */
export async function sendPaidOrderTickets(
  orderId: string,
  options: { copyOrganizer?: boolean; viewNotice?: SeatView[] } = {},
) {
  const order = await paidOrderForMail(orderId);
  if (!order) return { sent: false, mock: false };
  // Les ventes d'un point de vente partent toujours en copie à l'organisateur.
  const organizerCopy = options.copyOrganizer !== false || order.fromReseller;
  const copies = [
    ...new Set([...order.resellerEmails, ...(organizerCopy ? order.notifyEmails : [])]),
  ].filter((adresse) => adresse !== order.email);
  const to = order.email || copies.shift();
  if (!to) return { sent: false, mock: false };
  return sendTicketCards({
    to,
    bcc: copies.length > 0 ? copies : undefined,
    buyerName: order.buyerName,
    reference: order.reference,
    locale: order.locale,
    tickets: order.cards,
    viewNotice: options.viewNotice,
  });
}

/** Renvoi demandé par l'acheteur (SAV téléphonique) : son adresse seule, sans copie. */
export async function sendOrderTicketsToBuyer(orderId: string) {
  const order = await paidOrderForMail(orderId);
  if (!order?.email) return { sent: false, mock: false };
  return sendTicketCards({
    to: order.email,
    buyerName: order.buyerName,
    reference: order.reference,
    locale: order.locale,
    tickets: order.cards,
  });
}

export async function sendPreviewTicketEmail(to: string) {
  const locale = "fr";
  const venue = {
    name: "Abbaye de Bonmont",
    address: "Route de Bonmont 31",
    zip: "1275",
    city: "Chéserex",
  };
  const startsAt = new Date("2026-11-15T16:00:00+01:00");
  const doorsAt = new Date("2026-11-15T15:30:00+01:00");
  return sendTicketCards({
    to,
    buyerName: "Yann Durukan",
    reference: "APERCU-DEMO",
    locale,
    preview: true,
    tickets: [
      toTicketCard({
        code: "APERCU-DEMO-0001",
        eventTitle: {
          fr: "Beethoven — Messe en ut & Fantaisie chorale",
        },
        ticketName: { fr: "Plein tarif" },
        organizerName: "Chœur Cantabile",
        organizerSlug: "choeur-cantabile",
        organizerLogoUrl: "/partners/choeur-cantabile/logo.png",
        startsAt,
        doorsAt,
        venue,
        holderName: "Yann Durukan",
        reference: "APERCU-DEMO",
        priceCents: 3500,
        locale,
        optionBlocks: [
          {
            heading:
              "Y compris service de navette par minibus (à payer directement au chauffeur)",
            date: "Dimanche 15 novembre 2026",
            trips: [
              "1 Aller : 15h30 Gare de Nyon -> Abbaye de Bonmont (5 CHF)",
              "1 Retour : 19h30 Abbaye de Bonmont -> gare de Nyon (5 CHF)",
            ],
            total: "",
          },
        ],
      }),
      toTicketCard({
        code: "APERCU-DEMO-0002",
        eventTitle: {
          fr: "Beethoven — Messe en ut & Fantaisie chorale",
        },
        ticketName: { fr: "Gratuit — jusqu’à 16 ans" },
        organizerName: "Chœur Cantabile",
        organizerSlug: "choeur-cantabile",
        organizerLogoUrl: "/partners/choeur-cantabile/logo.png",
        startsAt,
        doorsAt,
        venue,
        holderName: "Yann Durukan",
        reference: "APERCU-DEMO",
        priceCents: 0,
        locale,
      }),
    ],
  });
}

function carteHtml(
  ticket: TicketCard,
  cid: string,
  t: ReturnType<typeof textes>,
  hasLogo: boolean,
): string {
  const adresse = ticket.venueLines.map((line) => echapper(line)).join("<br>");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:16px;background:#fff">
  <tr>
    <td style="padding:20px 20px 8px">
      ${
        hasLogo
          ? `<img src="cid:org-logo" alt="${echapper(ticket.organizerName)}" height="48" style="display:block;height:48px;width:auto;border:0;margin:0 0 12px"/>`
          : ""
      }
      <p style="margin:0 0 4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6C5CE7;font-weight:700">${echapper(ticket.organizerName)}</p>
      <p style="margin:0 0 8px;font-size:18px;font-weight:800;line-height:1.3">${echapper(ticket.eventTitle)}</p>
      <p style="margin:0;font-size:14px;font-weight:600">${echapper(ticket.ticketName)} · ${echapper(ticket.priceLabel)}</p>
      <p style="margin:8px 0 0;font-size:13px;color:#4b5563">${echapper(ticket.when)}</p>
      <p style="margin:8px 0 0;font-size:13px;color:#4b5563">${adresse}</p>
      <p style="margin:8px 0 0;font-size:13px">${echapper(t.holder)} ${echapper(ticket.holderName)}</p>
      <p style="margin:4px 0 0;font-size:13px;color:#4b5563">${echapper(ticket.seating)}</p>
      ${optionBlocksHtml(ticket)}
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

function optionBlocksHtml(ticket: TicketCard): string {
  if (!ticket.optionBlocks?.length) return "";
  return ticket.optionBlocks
    .map((block) => {
      const trips = block.trips
        .map((trip) => `<p style="margin:2px 0 0">${echapper(`• ${trip}`)}</p>`)
        .join("");
      return `<div style="margin:12px 0 0;padding:10px 12px;background:#F8F9FA;border-left:3px solid #6C5CE7;border-radius:0 8px 8px 0">
        <p style="margin:0;font-weight:700">${echapper(block.heading)}</p>
        <p style="margin:4px 0 0">${echapper(block.date)}</p>
        ${trips}
        ${
          block.total
            ? `<p style="margin:6px 0 0;font-weight:700">${echapper(block.total)}</p>`
            : ""
        }
      </div>`;
    })
    .join("");
}

function footerLogosHtml(
  ticket: TicketCard | undefined,
  hasBrand: boolean,
  hasProducer: boolean,
): string {
  const brand = hasBrand
    ? `<img src="cid:ticketick-logo" alt="ticketick" width="157" height="19" style="height:19px;width:157px;border:0;vertical-align:middle;margin:0 12px"/>`
    : "";
  const href = ticket?.producerUrl ?? "https://illyria.ch";
  const producer =
    hasProducer && ticket?.producerName
      ? `<a href="${echapper(href)}" style="text-decoration:none"><img src="cid:producer-logo" alt="${echapper(ticket.producerName)}" height="28" style="height:28px;width:auto;border:0;vertical-align:middle;margin:0 12px"/></a>`
      : "";
  if (!brand && !producer) return "";
  return `<div style="margin:20px 0 0;text-align:center">${brand}${producer}</div>`;
}

function textes(locale: string) {
  const pack = {
    fr: {
      vueSujet: "Vos billets ticketick.ch : visibilité de vos places",
      vueTitre: "Information importante sur vos places",
      vuePartielle: "Vos places sont en visibilité partielle : une partie de la scène n’est pas visible depuis celles-ci. La mention figure désormais sur vos billets ci-dessous et en pièce jointe ; ils restent valables tels quels.",
      vueAucune: "Vos places sont sans visibilité : la scène n’est pas visible depuis celles-ci. La mention figure désormais sur vos billets ci-dessous et en pièce jointe ; ils restent valables tels quels.",
      vueMixte: "Vos places sont en visibilité partielle ou sans visibilité sur la scène, selon la mention portée par chaque billet ci-dessous et en pièce jointe. Vos billets restent valables tels quels.",
      vueChangement: "Si vous souhaitez changer de places, écrivez-nous à",
      vueReference: (ref: string) => ` en indiquant votre référence ${ref}.`,
      sujet: "Votre commande ticketick.ch : vos billets",
      apercuSujet: "Aperçu — billet ticketick",
      bonjour: (nom: string) => `Bonjour ${nom},`,
      corps: "Merci pour votre commande. Présentez le QR à l’entrée : chaque billet n’est valable qu’une fois.",
      pdfLien: "Télécharger vos billets",
      apercuCorps:
        "Ceci est un aperçu : le QR n’ouvre aucune porte. Voici le rendu envoyé à l’acheteur.",
      reference: "Votre référence :",
      recap: "Récapitulatif de votre commande",
      colPlace: "Billet",
      colTarif: "Tarif",
      colPrix: "Prix",
      total: "Total",
      holder: "Titulaire :",
      disclaimer:
        "Ce billet ne peut être ni annulé, ni repris, ni échangé, ni remboursé. Il est interdit de présenter plusieurs exemplaires d’un même billet à l’entrée d’une manifestation, de modifier le billet ou de l’imiter. Conditions générales : ticketick.ch/terms",
      salutations: "Avec nos remerciements et nos meilleures salutations,",
      pied: "L’équipe ticketick.ch",
    },
    en: {
      vueSujet: "Your ticketick.ch tickets: view from your seats",
      vueTitre: "Important information about your seats",
      vuePartielle: "Your seats have a restricted view: part of the stage cannot be seen from them. This is now shown on your tickets below and attached; they remain valid as they are.",
      vueAucune: "Your seats have no view of the stage. This is now shown on your tickets below and attached; they remain valid as they are.",
      vueMixte: "Your seats have a restricted view or no view of the stage, as shown on each ticket below and attached. Your tickets remain valid as they are.",
      vueChangement: "If you would like to change seats, write to us at",
      vueReference: (ref: string) => ` quoting your reference ${ref}.`,
      sujet: "Your ticketick.ch order: your tickets",
      apercuSujet: "Preview — ticketick ticket",
      bonjour: (nom: string) => `Hello ${nom},`,
      corps: "Thank you for your order. Show the QR at the entrance: each ticket is valid once.",
      pdfLien: "Download your tickets",
      apercuCorps:
        "This is a preview: the QR code will not admit anyone. This is what the buyer receives.",
      reference: "Your reference:",
      recap: "Order summary",
      colPlace: "Ticket",
      colTarif: "Tariff",
      colPrix: "Price",
      total: "Total",
      holder: "Holder:",
      disclaimer:
        "This ticket cannot be cancelled, taken back, exchanged or refunded. Presenting several copies of the same ticket, altering or counterfeiting it is forbidden. Terms: ticketick.ch/terms",
      salutations: "With our thanks and best regards,",
      pied: "The ticketick.ch team",
    },
    de: {
      vueSujet: "Ihre Tickets auf ticketick.ch: Sicht von Ihren Plätzen",
      vueTitre: "Wichtige Information zu Ihren Plätzen",
      vuePartielle: "Ihre Plätze haben eine eingeschränkte Sicht: Ein Teil der Bühne ist von dort nicht sichtbar. Der Hinweis steht nun auf Ihren Tickets unten und im Anhang; sie bleiben unverändert gültig.",
      vueAucune: "Von Ihren Plätzen aus ist die Bühne nicht sichtbar. Der Hinweis steht nun auf Ihren Tickets unten und im Anhang; sie bleiben unverändert gültig.",
      vueMixte: "Ihre Plätze haben eine eingeschränkte oder keine Sicht auf die Bühne, wie auf jedem Ticket unten und im Anhang vermerkt. Ihre Tickets bleiben unverändert gültig.",
      vueChangement: "Möchten Sie andere Plätze, schreiben Sie uns an",
      vueReference: (ref: string) => ` mit Ihrer Referenz ${ref}.`,
      sujet: "Ihre Bestellung auf ticketick.ch: Ihre Tickets",
      apercuSujet: "Vorschau — ticketick-Ticket",
      bonjour: (nom: string) => `Guten Tag ${nom},`,
      corps: "Danke für Ihre Bestellung. Zeigen Sie den QR-Code am Eingang: jedes Ticket gilt nur einmal.",
      pdfLien: "Tickets herunterladen",
      apercuCorps:
        "Dies ist eine Vorschau: Der QR-Code öffnet keine Tür. So sieht die Nachricht an die Käuferin oder den Käufer aus.",
      reference: "Ihre Referenz:",
      recap: "Bestellübersicht",
      colPlace: "Ticket",
      colTarif: "Tarif",
      colPrix: "Preis",
      total: "Total",
      holder: "Inhaber:",
      disclaimer:
        "Dieses Ticket kann weder storniert, zurückgenommen, umgetauscht noch erstattet werden. Mehrere Exemplare desselben Tickets vorzuzeigen, es zu ändern oder nachzumachen ist verboten. AGB: ticketick.ch/terms",
      salutations: "Mit bestem Dank und freundlichen Grüssen,",
      pied: "Das Team von ticketick.ch",
    },
    it: {
      vueSujet: "I vostri biglietti ticketick.ch: visibilità dei posti",
      vueTitre: "Informazione importante sui vostri posti",
      vuePartielle: "I vostri posti sono a visibilità parziale: da lì una parte del palco non è visibile. L’indicazione figura ora sui biglietti qui sotto e in allegato, che restano validi così come sono.",
      vueAucune: "I vostri posti sono senza visibilità: da lì il palco non è visibile. L’indicazione figura ora sui biglietti qui sotto e in allegato, che restano validi così come sono.",
      vueMixte: "I vostri posti sono a visibilità parziale o senza visibilità sul palco, come indicato su ogni biglietto qui sotto e in allegato. I biglietti restano validi così come sono.",
      vueChangement: "Se desiderate cambiare posti, scriveteci a",
      vueReference: (ref: string) => ` indicando il riferimento ${ref}.`,
      sujet: "Il vostro ordine ticketick.ch: i biglietti",
      apercuSujet: "Anteprima — biglietto ticketick",
      bonjour: (nom: string) => `Buongiorno ${nom},`,
      corps: "Grazie per l’ordine. Mostrate il QR all’ingresso: ogni biglietto è valido una sola volta.",
      pdfLien: "Scaricare i biglietti",
      apercuCorps:
        "Questa è un’anteprima: il QR non apre nessun ingresso. Ecco cosa riceve chi acquista.",
      reference: "Il vostro riferimento:",
      recap: "Riepilogo dell’ordine",
      colPlace: "Biglietto",
      colTarif: "Tariffa",
      colPrix: "Prezzo",
      total: "Totale",
      holder: "Intestatario:",
      disclaimer:
        "Questo biglietto non può essere annullato, ripreso, cambiato o rimborsato. È vietato presentare più copie dello stesso biglietto, modificarlo o imitarlo. Condizioni: ticketick.ch/terms",
      salutations: "Con i nostri ringraziamenti e i migliori saluti,",
      pied: "Il team ticketick.ch",
    },
    es: {
      vueSujet: "Tus entradas de ticketick.ch: visibilidad de tus asientos",
      vueTitre: "Información importante sobre tus asientos",
      vuePartielle: "Tus asientos tienen visibilidad parcial: desde ellos no se ve una parte del escenario. La indicación figura ahora en tus entradas, abajo y en el adjunto; siguen siendo válidas tal cual.",
      vueAucune: "Tus asientos no tienen visibilidad del escenario. La indicación figura ahora en tus entradas, abajo y en el adjunto; siguen siendo válidas tal cual.",
      vueMixte: "Tus asientos tienen visibilidad parcial o nula del escenario, según indica cada entrada abajo y en el adjunto. Tus entradas siguen siendo válidas tal cual.",
      vueChangement: "Si quieres cambiar de asientos, escríbenos a",
      vueReference: (ref: string) => ` indicando tu referencia ${ref}.`,
      sujet: "Tu pedido en ticketick.ch: tus entradas",
      apercuSujet: "Vista previa — entrada ticketick",
      bonjour: (nom: string) => `Hola, ${nom}:`,
      corps: "Gracias por tu pedido. Muestra el código QR en la entrada: cada entrada solo es válida una vez.",
      pdfLien: "Descargar tus entradas",
      apercuCorps:
        "Esto es una vista previa: el código QR no da acceso. Así es lo que recibe quien compra.",
      reference: "Tu referencia:",
      recap: "Resumen de tu pedido",
      colPlace: "Entrada",
      colTarif: "Tarifa",
      colPrix: "Precio",
      total: "Total",
      holder: "Titular:",
      disclaimer:
        "Esta entrada no se puede anular, devolver, cambiar ni reembolsar. Está prohibido presentar varias copias de una misma entrada, modificarla o imitarla. Condiciones: ticketick.ch/terms",
      salutations: "Con nuestro agradecimiento y un cordial saludo,",
      pied: "El equipo de ticketick.ch",
    },
  } as const;
  return byLocale<(typeof pack)[keyof typeof pack]>(pack, locale);
}
