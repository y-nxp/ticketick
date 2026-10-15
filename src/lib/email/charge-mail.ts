import "server-only";

import { envoyer, echapper } from "@/lib/email";
import { byLocale, intlLocale } from "@/lib/i18n-fallback";
import { publicAppOrigin } from "@/lib/app-url";
import { cancellationOutcome, type CancellationCase } from "@/lib/orders/cancellation";
import { prisma } from "@/lib/prisma";
import { t as translate, type Translated } from "@/lib/types";
import { formatDate, formatPrice } from "@/lib/utils";

/**
 * Courriels d'un règlement, envoyés au nom de l'organisateur (réponses à son
 * adresse) : lien de paiement des places réservées, note de crédit des
 * places retirées.
 */

/**
 * Copies cachées d'un courriel au client : les mêmes que pour ses billets
 * (adresses de copie de l'organisateur et, pour une vente en point de vente,
 * celles du point de vente), plus les adresses données en sus.
 */
async function orderCopies(
  orderId: string,
  customer: string,
  extra: string[] = [],
): Promise<string[]> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      reseller: { select: { notifyEmails: true } },
      items: {
        select: {
          ticketType: {
            select: {
              session: {
                select: { event: { select: { organizer: { select: { notifyEmails: true } } } } },
              },
            },
          },
        },
      },
    },
  });
  const all = [
    ...extra,
    ...(order?.reseller?.notifyEmails ?? []),
    ...(order?.items.flatMap((i) => i.ticketType.session.event.organizer.notifyEmails) ?? []),
  ].map((a) => a.trim().toLowerCase());
  const own = customer.trim().toLowerCase();
  return [...new Set(all)].filter((a) => a && a !== own);
}

async function chargeForMail(chargeId: string) {
  const charge = await prisma.orderCharge.findUnique({
    where: { id: chargeId },
    select: {
      number: true,
      amountCents: true,
      currency: true,
      dueAt: true,
      ticketIds: true,
      orderId: true,
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
  totalLabel?: string;
  total?: string;
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
      ${
        input.totalLabel && input.total
          ? `<tr>
        <td style="padding:12px 0 0;font-weight:800">${echapper(input.totalLabel)}</td>
        <td style="padding:12px 0 0;text-align:right;font-weight:800">${echapper(input.total)}</td>
      </tr>`
          : ""
      }
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
    bcc: await orderCopies(charge.orderId, charge.order.email),
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
    bcc: await orderCopies(charge.orderId, charge.order.email, [organizer.email]),
    subject: t.titre(charge.number),
    text,
    html,
    fromName: organizer.name,
    replyTo: organizer.email,
    etiquette: "note de crédit",
  });
}

/**
 * Annonce au client les billets annulés choisis dans la fiche : remboursement
 * en cours, payés sans remboursement, gratuits ou jamais réglés.
 */
export async function sendCancellationEmail(input: {
  orderId: string;
  ticketIds: string[];
}): Promise<{ sent: boolean; case?: CancellationCase }> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      email: true,
      firstName: true,
      lastName: true,
      locale: true,
      reference: true,
      currency: true,
      payment: { select: { status: true, amountCents: true } },
      items: { select: { ticketTypeId: true, unitPriceCents: true } },
      charges: {
        where: { status: { not: "CANCELLED" } },
        select: { kind: true, status: true, amountCents: true, ticketIds: true },
      },
      tickets: {
        where: { id: { in: input.ticketIds }, status: "CANCELLED" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          ticketTypeId: true,
          seatLabel: true,
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
                      organizer: { select: { name: true, email: true } },
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
  const organizer = order?.tickets[0]?.ticketType.session.event.organizer;
  if (!order?.email || !organizer) return { sent: false };

  const priceOf = new Map(order.items.map((i) => [i.ticketTypeId, i.unitPriceCents]));
  const { case: kind, refundCents } = cancellationOutcome({
    tickets: order.tickets.map((t) => ({ id: t.id, priceCents: priceOf.get(t.ticketTypeId) ?? 0 })),
    payment: order.payment,
    charges: order.charges,
  });

  const locale = order.locale;
  const t = byLocale(CANCEL_TEXTES, locale);
  const name = `${order.firstName} ${order.lastName}`.trim();
  const refund = formatPrice(refundCents, intlLocale(locale), order.currency);
  const lines = order.tickets.map((ticket) => {
    const session = ticket.ticketType.session;
    return {
      event: translate(session.event.title as Translated, locale),
      when: dateTime(session.startsAt, locale),
      venue: session.venue ? `${session.venue.name}, ${session.venue.city}` : "",
      tariff: translate(ticket.ticketType.name as Translated, locale),
      seat: ticket.seatLabel ?? "",
    };
  });
  const paragraphs = [t.bonjour(name), t.corps(organizer.name, order.reference, lines.length)];
  const after = [
    kind === "refund" ? t.refund(refund) : t[kind],
    t.questions,
  ];
  const html = layout({
    locale,
    organizer: organizer.name,
    title: t.titre(lines.length),
    paragraphs,
    lines,
    ...(kind === "refund" ? { totalLabel: t.total, total: refund } : {}),
    after,
    closing: t.salutations,
  });
  const text = [
    ...paragraphs,
    "",
    ...lines.map((l) => [l.event, l.when, l.venue, l.tariff, l.seat].filter(Boolean).join(" — ")),
    ...(kind === "refund" ? [`${t.total} ${refund}`] : []),
    "",
    ...after,
    "",
    t.salutations,
    organizer.name,
  ].join("\n");

  const result = await envoyer({
    to: order.email,
    bcc: await orderCopies(input.orderId, order.email, [organizer.email]),
    subject: t.sujet(organizer.name, order.reference),
    text,
    html,
    fromName: organizer.name,
    replyTo: organizer.email,
    etiquette: "annulation de billets",
  });
  if (result.sent) {
    await prisma.ticket.updateMany({
      where: { id: { in: order.tickets.map((t) => t.id) } },
      data: { cancelNoticeSentAt: new Date() },
    });
  }
  return { sent: result.sent, case: kind };
}

const CANCEL_TEXTES = {
  fr: {
    sujet: (org: string, ref: string) => `${org} — annulation de billets (${ref})`,
    titre: (n: number) => (n > 1 ? "Vos billets sont annulés" : "Votre billet est annulé"),
    bonjour: (nom: string) => (nom ? `Bonjour ${nom},` : "Bonjour,"),
    corps: (org: string, ref: string, n: number) =>
      n > 1
        ? `${org} a annulé les billets ci-dessous de votre commande ${ref}. Ils ne sont plus valables à l'entrée.`
        : `${org} a annulé le billet ci-dessous de votre commande ${ref}. Il n'est plus valable à l'entrée.`,
    total: "Montant remboursé",
    refund: (m: string) =>
      `Le remboursement de ${m} est en cours : vous recevrez l'argent prochainement.`,
    noRefund: "Cette annulation ne donne pas lieu à un remboursement.",
    free: "Ces billets étaient gratuits : aucun paiement n'ayant été effectué, il n'y a pas de remboursement.",
    unpaid: "Aucun paiement n'ayant été effectué pour ces billets, il n'y a pas de remboursement.",
    questions: "Une question ? Répondez simplement à ce message.",
    salutations: "Avec nos meilleures salutations,",
  },
  en: {
    sujet: (org: string, ref: string) => `${org} — tickets cancelled (${ref})`,
    titre: (n: number) => (n > 1 ? "Your tickets are cancelled" : "Your ticket is cancelled"),
    bonjour: (nom: string) => (nom ? `Hello ${nom},` : "Hello,"),
    corps: (org: string, ref: string, n: number) =>
      n > 1
        ? `${org} has cancelled the tickets below from your order ${ref}. They are no longer valid at the door.`
        : `${org} has cancelled the ticket below from your order ${ref}. It is no longer valid at the door.`,
    total: "Amount refunded",
    refund: (m: string) =>
      `The refund of ${m} is under way: you will receive the money shortly.`,
    noRefund: "This cancellation does not give rise to a refund.",
    free: "These tickets were free: as no payment was made, there is no refund.",
    unpaid: "As no payment was made for these tickets, there is no refund.",
    questions: "Any question? Simply reply to this message.",
    salutations: "Best regards,",
  },
  de: {
    sujet: (org: string, ref: string) => `${org} — Stornierung von Tickets (${ref})`,
    titre: (n: number) => (n > 1 ? "Ihre Tickets sind storniert" : "Ihr Ticket ist storniert"),
    bonjour: (nom: string) => (nom ? `Guten Tag ${nom},` : "Guten Tag,"),
    corps: (org: string, ref: string, n: number) =>
      n > 1
        ? `${org} hat die untenstehenden Tickets Ihrer Bestellung ${ref} storniert. Sie sind am Eingang nicht mehr gültig.`
        : `${org} hat das untenstehende Ticket Ihrer Bestellung ${ref} storniert. Es ist am Eingang nicht mehr gültig.`,
    total: "Rückerstatteter Betrag",
    refund: (m: string) =>
      `Die Rückerstattung von ${m} ist in Bearbeitung: Sie erhalten das Geld in Kürze.`,
    noRefund: "Diese Stornierung führt zu keiner Rückerstattung.",
    free: "Diese Tickets waren kostenlos: Da keine Zahlung erfolgt ist, gibt es keine Rückerstattung.",
    unpaid: "Da für diese Tickets keine Zahlung erfolgt ist, gibt es keine Rückerstattung.",
    questions: "Fragen? Antworten Sie einfach auf diese Nachricht.",
    salutations: "Freundliche Grüsse",
  },
  it: {
    sujet: (org: string, ref: string) => `${org} — annullamento di biglietti (${ref})`,
    titre: (n: number) =>
      n > 1 ? "I vostri biglietti sono annullati" : "Il vostro biglietto è annullato",
    bonjour: (nom: string) => (nom ? `Buongiorno ${nom},` : "Buongiorno,"),
    corps: (org: string, ref: string, n: number) =>
      n > 1
        ? `${org} ha annullato i biglietti qui sotto del vostro ordine ${ref}. Non sono più validi all'ingresso.`
        : `${org} ha annullato il biglietto qui sotto del vostro ordine ${ref}. Non è più valido all'ingresso.`,
    total: "Importo rimborsato",
    refund: (m: string) =>
      `Il rimborso di ${m} è in corso: riceverete il denaro prossimamente.`,
    noRefund: "Questo annullamento non dà luogo a un rimborso.",
    free: "Questi biglietti erano gratuiti: non essendo stato effettuato alcun pagamento, non c'è rimborso.",
    unpaid: "Non essendo stato effettuato alcun pagamento per questi biglietti, non c'è rimborso.",
    questions: "Domande? Rispondete semplicemente a questo messaggio.",
    salutations: "Cordiali saluti,",
  },
  es: {
    sujet: (org: string, ref: string) => `${org} — anulación de entradas (${ref})`,
    titre: (n: number) => (n > 1 ? "Tus entradas están anuladas" : "Tu entrada está anulada"),
    bonjour: (nom: string) => (nom ? `Hola, ${nom}:` : "Hola:"),
    corps: (org: string, ref: string, n: number) =>
      n > 1
        ? `${org} ha anulado las entradas siguientes de tu pedido ${ref}. Ya no son válidas en la entrada.`
        : `${org} ha anulado la entrada siguiente de tu pedido ${ref}. Ya no es válida en la entrada.`,
    total: "Importe reembolsado",
    refund: (m: string) =>
      `El reembolso de ${m} está en curso: recibirás el dinero próximamente.`,
    noRefund: "Esta anulación no da lugar a reembolso.",
    free: "Estas entradas eran gratuitas: al no haberse efectuado ningún pago, no hay reembolso.",
    unpaid: "Al no haberse efectuado ningún pago por estas entradas, no hay reembolso.",
    questions: "¿Alguna pregunta? Responde a este mensaje.",
    salutations: "Un cordial saludo,",
  },
};

export function payUrlFor(path: string): string {
  return `${publicAppOrigin()}${path}`;
}

/** Lien de changement de places : le client choisit lui-même sur le plan. */
export async function sendSeatChangeLinkEmail(input: {
  orderId: string;
  url: string;
  expiresAt: Date;
}): Promise<{ sent: boolean }> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      email: true,
      firstName: true,
      lastName: true,
      locale: true,
      reference: true,
      tickets: {
        where: {
          status: "VALID",
          seatKey: { not: null },
          ticketType: { session: { startsAt: { gt: new Date() } } },
        },
        orderBy: [{ ticketType: { session: { startsAt: "asc" } } }, { seatKey: "asc" }],
        select: {
          seatLabel: true,
          ticketType: {
            select: {
              name: true,
              session: {
                select: {
                  startsAt: true,
                  venue: { select: { name: true, city: true } },
                  event: {
                    select: { title: true, organizer: { select: { name: true } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  const organizer = order?.tickets[0]?.ticketType.session.event.organizer;
  if (!order?.email || !organizer) return { sent: false };

  const locale = order.locale;
  const t = byLocale(CHANGE_TEXTES, locale);
  const name = `${order.firstName} ${order.lastName}`.trim();
  const lines = order.tickets.map((ticket) => {
    const session = ticket.ticketType.session;
    return {
      event: translate(session.event.title as Translated, locale),
      when: dateTime(session.startsAt, locale),
      venue: session.venue ? `${session.venue.name}, ${session.venue.city}` : "",
      tariff: translate(ticket.ticketType.name as Translated, locale),
      seat: ticket.seatLabel ?? "",
    };
  });
  const paragraphs = [t.bonjour(name), t.corps(order.reference)];
  const after = [t.difference, t.anciens, t.echeance(dateTime(input.expiresAt, locale)), t.questions];
  const html = layout({
    locale,
    organizer: organizer.name,
    title: t.titre,
    paragraphs,
    lines,
    button: { href: input.url, label: t.bouton },
    after,
    closing: t.salutations,
  });
  const text = [
    ...paragraphs,
    "",
    ...lines.map((l) => [l.event, l.when, l.venue, l.tariff, l.seat].filter(Boolean).join(" — ")),
    "",
    `${t.bouton} : ${input.url}`,
    "",
    ...after,
    "",
    t.salutations,
    organizer.name,
  ].join("\n");

  return envoyer({
    to: order.email,
    bcc: await orderCopies(input.orderId, order.email),
    subject: t.sujet(organizer.name, order.reference),
    text,
    html,
    fromName: organizer.name,
    etiquette: "changement de billets",
  });
}

const CHANGE_TEXTES = {
  fr: {
    sujet: (org: string, ref: string) => `${org} — changer vos billets (${ref})`,
    titre: "Changer de places ou de spectacle",
    bonjour: (nom: string) => (nom ? `Bonjour ${nom},` : "Bonjour,"),
    corps: (ref: string) =>
      `Vous pouvez modifier vous-même votre commande ${ref} : choisir d'autres places, passer à un autre spectacle ou ajouter des billets. Vos billets actuels :`,
    bouton: "Changer mes billets",
    difference:
      "Si le nouveau choix coûte plus cher, vous ne payez que la différence, par carte. Aucun remboursement n'est fait si le nouveau choix coûte moins cher.",
    anciens:
      "Vos billets actuels restent valables jusqu'au changement. Vous recevez ensuite vos nouveaux billets : les anciens ne sont plus acceptés à l'entrée.",
    echeance: (d: string) => `Ce lien est valable jusqu'au ${d}.`,
    questions: "Une question ? Répondez simplement à ce message.",
    salutations: "Avec nos meilleures salutations,",
  },
  en: {
    sujet: (org: string, ref: string) => `${org} — change your tickets (${ref})`,
    titre: "Change seats or show",
    bonjour: (nom: string) => (nom ? `Hello ${nom},` : "Hello,"),
    corps: (ref: string) =>
      `You can change your order ${ref} yourself: choose other seats, switch to another show or add tickets. Your current tickets:`,
    bouton: "Change my tickets",
    difference:
      "If your new choice costs more, you only pay the difference, by card. Nothing is refunded if it costs less.",
    anciens:
      "Your current tickets remain valid until the change. You then receive your new tickets: the old ones are no longer accepted at the door.",
    echeance: (d: string) => `This link is valid until ${d}.`,
    questions: "Any question? Simply reply to this message.",
    salutations: "Best regards,",
  },
  de: {
    sujet: (org: string, ref: string) => `${org} — Ihre Tickets ändern (${ref})`,
    titre: "Plätze oder Vorstellung ändern",
    bonjour: (nom: string) => (nom ? `Guten Tag ${nom},` : "Guten Tag,"),
    corps: (ref: string) =>
      `Sie können Ihre Bestellung ${ref} selbst ändern: andere Plätze wählen, zu einer anderen Vorstellung wechseln oder Tickets hinzufügen. Ihre aktuellen Tickets:`,
    bouton: "Meine Tickets ändern",
    difference:
      "Ist Ihre neue Wahl teurer, bezahlen Sie nur die Differenz, per Karte. Ist sie günstiger, wird nichts erstattet.",
    anciens:
      "Ihre aktuellen Tickets bleiben bis zur Änderung gültig. Danach erhalten Sie Ihre neuen Tickets: Die alten werden am Eingang nicht mehr akzeptiert.",
    echeance: (d: string) => `Dieser Link ist bis ${d} gültig.`,
    questions: "Fragen? Antworten Sie einfach auf diese Nachricht.",
    salutations: "Freundliche Grüsse",
  },
  it: {
    sujet: (org: string, ref: string) => `${org} — cambiare i vostri biglietti (${ref})`,
    titre: "Cambiare posti o spettacolo",
    bonjour: (nom: string) => (nom ? `Buongiorno ${nom},` : "Buongiorno,"),
    corps: (ref: string) =>
      `Potete modificare voi stessi il vostro ordine ${ref}: scegliere altri posti, passare a un altro spettacolo o aggiungere biglietti. I vostri biglietti attuali:`,
    bouton: "Cambiare i miei biglietti",
    difference:
      "Se la nuova scelta costa di più, pagate solo la differenza, con carta. Se costa meno, non viene rimborsato nulla.",
    anciens:
      "I vostri biglietti attuali restano validi fino al cambio. Riceverete poi i nuovi biglietti: quelli vecchi non saranno più accettati all'ingresso.",
    echeance: (d: string) => `Questo link è valido fino al ${d}.`,
    questions: "Domande? Rispondete semplicemente a questo messaggio.",
    salutations: "Cordiali saluti,",
  },
  es: {
    sujet: (org: string, ref: string) => `${org} — cambiar tus entradas (${ref})`,
    titre: "Cambiar de localidades o de espectáculo",
    bonjour: (nom: string) => (nom ? `Hola, ${nom}:` : "Hola:"),
    corps: (ref: string) =>
      `Puedes modificar tú mismo tu pedido ${ref}: elegir otras localidades, pasar a otro espectáculo o añadir entradas. Tus entradas actuales:`,
    bouton: "Cambiar mis entradas",
    difference:
      "Si tu nueva elección cuesta más, solo pagas la diferencia, con tarjeta. Si cuesta menos, no se reembolsa nada.",
    anciens:
      "Tus entradas actuales siguen siendo válidas hasta el cambio. Después recibirás tus nuevas entradas: las antiguas ya no se aceptarán en la entrada.",
    echeance: (d: string) => `Este enlace es válido hasta el ${d}.`,
    questions: "¿Alguna pregunta? Responde a este mensaje.",
    salutations: "Un cordial saludo,",
  },
};

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
