import "server-only";

import { envoyer, echapper } from "@/lib/email";
import { byLocale, intlLocale } from "@/lib/i18n-fallback";
import { publicAppOrigin } from "@/lib/app-url";
import { prisma } from "@/lib/prisma";
import { t as translate, type Translated } from "@/lib/types";
import { formatDate, formatPrice } from "@/lib/utils";

/**
 * Courriels d'un règlement, envoyés au nom de l'organisateur (réponses à son
 * adresse) : lien de paiement des places réservées, note de crédit des
 * places retirées.
 */

async function chargeForMail(chargeId: string) {
  const charge = await prisma.orderCharge.findUnique({
    where: { id: chargeId },
    select: {
      number: true,
      amountCents: true,
      currency: true,
      dueAt: true,
      ticketIds: true,
      order: {
        select: {
          email: true,
          firstName: true,
          lastName: true,
          locale: true,
          reference: true,
        },
      },
    },
  });
  if (!charge?.order.email) return null;

  const tickets = await prisma.ticket.findMany({
    where: { id: { in: charge.ticketIds } },
    orderBy: { createdAt: "asc" },
    select: {
      seatLabel: true,
      ticketType: {
        select: {
          name: true,
          priceCents: true,
          session: {
            select: {
              startsAt: true,
              venue: { select: { name: true, city: true } },
              event: {
                select: {
                  title: true,
                  organizer: { select: { name: true, email: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  const organizer = tickets[0]?.ticketType.session.event.organizer;
  if (!organizer) return null;

  const locale = charge.order.locale;
  const lines = tickets.map((ticket) => {
    const session = ticket.ticketType.session;
    return {
      event: translate(session.event.title as Translated, locale),
      when: dateTime(session.startsAt, locale),
      venue: session.venue ? `${session.venue.name}, ${session.venue.city}` : "",
      tariff: translate(ticket.ticketType.name as Translated, locale),
      seat: ticket.seatLabel ?? "",
    };
  });
  return { charge, organizer, lines, locale };
}

function dateTime(date: Date, locale: string): string {
  return formatDate(date, intlLocale(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function layout(input: {
  locale: string;
  organizer: string;
  title: string;
  paragraphs: string[];
  lines: { event: string; when: string; venue: string; tariff: string; seat: string }[];
  totalLabel: string;
  total: string;
  button?: { href: string; label: string };
  after: string[];
  closing: string;
}): string {
  const rows = input.lines
    .map(
      (line) => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;vertical-align:top">
          <p style="margin:0;font-weight:700">${echapper(line.event)}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#4b5563">${echapper(line.when)}${line.venue ? `<br>${echapper(line.venue)}` : ""}</p>
        </td>
        <td style="padding:10px 0 10px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top;text-align:right">${echapper(line.tariff)}${line.seat ? `<br><span style="font-size:13px;color:#4b5563">${echapper(line.seat)}</span>` : ""}</td>
      </tr>`,
    )
    .join("");
  const paragraphs = input.paragraphs
    .map((p) => `<p style="margin:0 0 12px;line-height:1.5">${echapper(p)}</p>`)
    .join("");
  const after = input.after
    .map((p) => `<p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#4b5563">${echapper(p)}</p>`)
    .join("");
  const button = input.button
    ? `<p style="margin:8px 0 24px"><a href="${echapper(input.button.href)}" style="display:inline-block;background:#6C5CE7;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px">${echapper(input.button.label)}</a></p>`
    : "";
  return `<!DOCTYPE html>
<html lang="${echapper(input.locale)}">
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:24px;background:#F8F9FA;font-family:Inter,system-ui,sans-serif;color:#2A2C30">
  <div style="max-width:600px;margin:0 auto">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#6C5CE7;font-weight:800">${echapper(input.organizer)}</p>
    <h1 style="margin:0 0 16px;font-size:22px">${echapper(input.title)}</h1>
    ${paragraphs}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 16px;border-collapse:collapse">
      ${rows}
      <tr>
        <td style="padding:12px 0 0;font-weight:800">${echapper(input.totalLabel)}</td>
        <td style="padding:12px 0 0;text-align:right;font-weight:800">${echapper(input.total)}</td>
      </tr>
    </table>
    ${button}
    ${after}
    <p style="margin:16px 0 0;font-size:13px;line-height:1.5">${echapper(input.closing)}<br>${echapper(input.organizer)}</p>
  </div>
</body>
</html>`;
}

/** Lien de paiement : le client paie par carte, avant l'échéance. */
export async function sendPaymentLinkEmail(
  chargeId: string,
  payUrl: string,
): Promise<{ sent: boolean }> {
  const data = await chargeForMail(chargeId);
  if (!data) return { sent: false };
  const { charge, organizer, lines, locale } = data;
  const t = byLocale(LINK_TEXTES, locale);
  const name = `${charge.order.firstName} ${charge.order.lastName}`.trim();
  const total = formatPrice(charge.amountCents, intlLocale(locale), charge.currency);
  const due = charge.dueAt ? dateTime(charge.dueAt, locale) : null;

  const paragraphs = [t.bonjour(name), t.corps(organizer.name)];
  const after = [
    ...(due ? [t.echeance(due)] : []),
    t.reference(charge.number),
    t.questions,
  ];
  const html = layout({
    locale,
    organizer: organizer.name,
    title: t.titre,
    paragraphs,
    lines,
    totalLabel: t.total,
    total,
    button: { href: payUrl, label: t.bouton(total) },
    after,
    closing: t.salutations,
  });
  const text = [
    ...paragraphs,
    "",
    ...lines.map((l) => [l.event, l.when, l.venue, l.tariff, l.seat].filter(Boolean).join(" — ")),
    `${t.total} ${total}`,
    "",
    `${t.bouton(total)} : ${payUrl}`,
    "",
    ...after,
    "",
    t.salutations,
    organizer.name,
  ].join("\n");

  return envoyer({
    to: charge.order.email,
    subject: t.sujet(organizer.name, charge.number),
    text,
    html,
    fromName: organizer.name,
    replyTo: organizer.email,
    etiquette: "lien de paiement",
  });
}

/** Note de crédit : l'organisateur rembourse par virement. */
export async function sendCreditNoteEmail(chargeId: string): Promise<{ sent: boolean }> {
  const data = await chargeForMail(chargeId);
  if (!data) return { sent: false };
  const { charge, organizer, lines, locale } = data;
  const t = byLocale(CREDIT_TEXTES, locale);
  const name = `${charge.order.firstName} ${charge.order.lastName}`.trim();
  const total = formatPrice(charge.amountCents, intlLocale(locale), charge.currency);

  const paragraphs = [t.bonjour(name), t.corps(organizer.name, charge.order.reference)];
  const after = [t.virement, t.reference(charge.number)];
  const html = layout({
    locale,
    organizer: organizer.name,
    title: t.titre(charge.number),
    paragraphs,
    lines,
    totalLabel: t.total,
    total,
    after,
    closing: t.salutations,
  });
  const text = [
    ...paragraphs,
    "",
    ...lines.map((l) => [l.event, l.when, l.tariff, l.seat].filter(Boolean).join(" — ")),
    `${t.total} ${total}`,
    "",
    ...after,
    "",
    t.salutations,
    organizer.name,
  ].join("\n");

  return envoyer({
    to: charge.order.email,
    bcc: [organizer.email].filter((a) => a && a !== charge.order.email),
    subject: t.titre(charge.number),
    text,
    html,
    fromName: organizer.name,
    replyTo: organizer.email,
    etiquette: "note de crédit",
  });
}

export function payUrlFor(path: string): string {
  return `${publicAppOrigin()}${path}`;
}

const LINK_TEXTES = {
  fr: {
    sujet: (org: string, n: string) => `${org} — vos places à régler (${n})`,
    titre: "Vos places sont réservées",
    bonjour: (nom: string) => (nom ? `Bonjour ${nom},` : "Bonjour,"),
    corps: (org: string) =>
      `${org} a réservé pour vous les places ci-dessous. Elles vous sont acquises dès le paiement par carte, sur la page sécurisée.`,
    total: "Montant à régler",
    bouton: (m: string) => `Payer ${m}`,
    echeance: (d: string) =>
      `Sans paiement d'ici au ${d}, la réservation sera annulée et les places remises en vente.`,
    reference: (n: string) => `Référence : ${n}`,
    questions: "Une question ? Répondez simplement à ce message.",
    salutations: "Avec nos meilleures salutations,",
  },
  en: {
    sujet: (org: string, n: string) => `${org} — your seats to pay (${n})`,
    titre: "Your seats are reserved",
    bonjour: (nom: string) => (nom ? `Hello ${nom},` : "Hello,"),
    corps: (org: string) =>
      `${org} has reserved the seats below for you. They are yours once paid by card on the secure page.`,
    total: "Amount due",
    bouton: (m: string) => `Pay ${m}`,
    echeance: (d: string) =>
      `Without payment by ${d}, the reservation will be cancelled and the seats put back on sale.`,
    reference: (n: string) => `Reference: ${n}`,
    questions: "Any question? Simply reply to this message.",
    salutations: "Best regards,",
  },
  de: {
    sujet: (org: string, n: string) => `${org} — Ihre Plätze zur Zahlung (${n})`,
    titre: "Ihre Plätze sind reserviert",
    bonjour: (nom: string) => (nom ? `Guten Tag ${nom},` : "Guten Tag,"),
    corps: (org: string) =>
      `${org} hat die untenstehenden Plätze für Sie reserviert. Sie gehören Ihnen, sobald sie auf der sicheren Seite per Karte bezahlt sind.`,
    total: "Zu zahlender Betrag",
    bouton: (m: string) => `${m} bezahlen`,
    echeance: (d: string) =>
      `Ohne Zahlung bis ${d} wird die Reservation storniert und die Plätze gehen wieder in den Verkauf.`,
    reference: (n: string) => `Referenz: ${n}`,
    questions: "Fragen? Antworten Sie einfach auf diese Nachricht.",
    salutations: "Freundliche Grüsse",
  },
  it: {
    sujet: (org: string, n: string) => `${org} — i vostri posti da pagare (${n})`,
    titre: "I vostri posti sono riservati",
    bonjour: (nom: string) => (nom ? `Buongiorno ${nom},` : "Buongiorno,"),
    corps: (org: string) =>
      `${org} ha riservato per voi i posti qui sotto. Diventano vostri con il pagamento con carta sulla pagina sicura.`,
    total: "Importo da pagare",
    bouton: (m: string) => `Pagare ${m}`,
    echeance: (d: string) =>
      `Senza pagamento entro il ${d}, la prenotazione sarà annullata e i posti rimessi in vendita.`,
    reference: (n: string) => `Riferimento: ${n}`,
    questions: "Domande? Rispondete semplicemente a questo messaggio.",
    salutations: "Cordiali saluti,",
  },
  es: {
    sujet: (org: string, n: string) => `${org} — tus localidades por pagar (${n})`,
    titre: "Tus localidades están reservadas",
    bonjour: (nom: string) => (nom ? `Hola, ${nom}:` : "Hola:"),
    corps: (org: string) =>
      `${org} ha reservado para ti las localidades siguientes. Serán tuyas en cuanto las pagues con tarjeta en la página segura.`,
    total: "Importe a pagar",
    bouton: (m: string) => `Pagar ${m}`,
    echeance: (d: string) =>
      `Sin pago antes del ${d}, la reserva se anulará y las localidades volverán a la venta.`,
    reference: (n: string) => `Referencia: ${n}`,
    questions: "¿Alguna pregunta? Responde a este mensaje.",
    salutations: "Un cordial saludo,",
  },
};

const CREDIT_TEXTES = {
  fr: {
    titre: (n: string) => `Note de crédit ${n}`,
    bonjour: (nom: string) => (nom ? `Bonjour ${nom},` : "Bonjour,"),
    corps: (org: string, ref: string) =>
      `${org} a retiré de votre commande ${ref} les places ci-dessous. Le montant indiqué vous est dû.`,
    total: "Montant remboursé",
    virement:
      "Il vous sera remboursé par virement : merci de répondre à ce message en indiquant votre IBAN et le nom du titulaire du compte.",
    reference: (n: string) => `Référence : ${n}`,
    salutations: "Avec nos meilleures salutations,",
  },
  en: {
    titre: (n: string) => `Credit note ${n}`,
    bonjour: (nom: string) => (nom ? `Hello ${nom},` : "Hello,"),
    corps: (org: string, ref: string) =>
      `${org} has removed the seats below from your order ${ref}. The amount shown is owed to you.`,
    total: "Amount refunded",
    virement:
      "It will be refunded by bank transfer: please reply to this message with your IBAN and the account holder's name.",
    reference: (n: string) => `Reference: ${n}`,
    salutations: "Best regards,",
  },
  de: {
    titre: (n: string) => `Gutschrift ${n}`,
    bonjour: (nom: string) => (nom ? `Guten Tag ${nom},` : "Guten Tag,"),
    corps: (org: string, ref: string) =>
      `${org} hat die untenstehenden Plätze aus Ihrer Bestellung ${ref} entfernt. Der angegebene Betrag steht Ihnen zu.`,
    total: "Rückerstatteter Betrag",
    virement:
      "Er wird Ihnen per Überweisung erstattet: Bitte antworten Sie auf diese Nachricht mit Ihrer IBAN und dem Namen der Kontoinhaberin oder des Kontoinhabers.",
    reference: (n: string) => `Referenz: ${n}`,
    salutations: "Freundliche Grüsse",
  },
  it: {
    titre: (n: string) => `Nota di credito ${n}`,
    bonjour: (nom: string) => (nom ? `Buongiorno ${nom},` : "Buongiorno,"),
    corps: (org: string, ref: string) =>
      `${org} ha tolto dal vostro ordine ${ref} i posti qui sotto. L'importo indicato vi è dovuto.`,
    total: "Importo rimborsato",
    virement:
      "Vi sarà rimborsato con bonifico: rispondete a questo messaggio indicando il vostro IBAN e il nome del titolare del conto.",
    reference: (n: string) => `Riferimento: ${n}`,
    salutations: "Cordiali saluti,",
  },
  es: {
    titre: (n: string) => `Nota de crédito ${n}`,
    bonjour: (nom: string) => (nom ? `Hola, ${nom}:` : "Hola:"),
    corps: (org: string, ref: string) =>
      `${org} ha retirado de tu pedido ${ref} las localidades siguientes. El importe indicado se te debe.`,
    total: "Importe reembolsado",
    virement:
      "Se te reembolsará por transferencia: responde a este mensaje indicando tu IBAN y el nombre del titular de la cuenta.",
    reference: (n: string) => `Referencia: ${n}`,
    salutations: "Un cordial saludo,",
  },
};
