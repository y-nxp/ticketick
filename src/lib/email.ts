import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

/**
 * Envoi de courriels.
 *
 * Transport SMTP : SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM.
 * Sans configuration, le message est journalisé au lieu d'être envoyé — de
 * quoi dérouler le tunnel de commande en développement sans boîte aux lettres.
 *
 * L'envoi ne fait jamais échouer l'appelant : une commande payée ne doit pas
 * être perdue parce que le serveur de messagerie est indisponible. Les échecs
 * sont journalisés et le message signalé comme non parti.
 */

export interface TicketEmailPayload {
  to: string;
  firstName: string;
  reference: string;
  locale: string;
  paymentMethod: "CARD" | "IBAN";
  totalCents: number;
  currency: string;
  items: { name: string; quantity: number }[];
  ibanInstructions?: {
    iban: string;
    beneficiary: string;
    amountCents: number;
    reference: string;
  };
}

export interface PasswordResetPayload {
  to: string;
  name: string | null;
  locale: string;
  url: string;
  expiresInMinutes: number;
}

export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
}

let transport: Transporter | null = null;

function getTransport(): Transporter {
  const port = Number(process.env.SMTP_PORT ?? 587);
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 impose TLS d'emblée ; 587 ouvre en clair puis bascule par STARTTLS.
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transport;
}

function expediteur(): string {
  return process.env.MAIL_FROM ?? "ticketick <billets@ticketick.ch>";
}

async function envoyer(options: {
  to: string;
  subject: string;
  text: string;
  html: string;
  etiquette: string;
}): Promise<{ sent: boolean; mock: boolean }> {
  if (!isMailConfigured()) {
    console.info(
      `[email:mock] ${options.etiquette} → ${options.to} — « ${options.subject} »`,
    );
    // Le contenu est journalisé en entier : sans boîte de réception, c'est le
    // seul moyen de récupérer un lien de réinitialisation en développement.
    console.info(options.text);
    return { sent: true, mock: true };
  }

  try {
    const info = await getTransport().sendMail({
      from: expediteur(),
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
    // Le succès est journalisé autant que l'échec : sans cette trace, un
    // message parti et un message jamais tenté se ressemblent, et l'on ne
    // peut pas répondre à « je n'ai rien reçu ». Le contenu, lui, n'y figure
    // pas : un lien de réinitialisation dans un journal serait exploitable.
    console.info(
      `[email] ${options.etiquette} envoyé à ${options.to} — ${info.messageId}`,
    );
    return { sent: true, mock: false };
  } catch (error) {
    console.error(`[email] envoi impossible (${options.etiquette})`, error);
    return { sent: false, mock: false };
  }
}

// ─────────────────────────────── Billets

export async function sendTicketEmail(payload: TicketEmailPayload) {
  const lignes = payload.items
    .map((i) => `- ${i.quantity} × ${i.name}`)
    .join("\n");

  const montant = (payload.totalCents / 100).toFixed(2);
  const attente = payload.paymentMethod === "IBAN";

  const virement = payload.ibanInstructions
    ? [
        "",
        "Coordonnées pour le virement :",
        `  IBAN        : ${payload.ibanInstructions.iban}`,
        `  Bénéficiaire: ${payload.ibanInstructions.beneficiary}`,
        `  Montant     : ${montant} ${payload.currency}`,
        `  Référence   : ${payload.ibanInstructions.reference}`,
      ].join("\n")
    : "";

  const text = [
    `Bonjour ${payload.firstName},`,
    "",
    attente
      ? `Votre commande ${payload.reference} est enregistrée. Elle sera confirmée dès réception de votre virement.`
      : `Votre commande ${payload.reference} est confirmée.`,
    "",
    lignes,
    "",
    `Total : ${montant} ${payload.currency}`,
    virement,
    "",
    "ticketick.ch",
  ].join("\n");

  return envoyer({
    to: payload.to,
    subject: attente
      ? `Commande ${payload.reference} — en attente de paiement`
      : `Commande ${payload.reference} — confirmée`,
    text,
    html: `<pre style="font:14px/1.5 system-ui">${echapper(text)}</pre>`,
    etiquette: "billets",
  });
}

// ─────────────────────────────── Réinitialisation

/**
 * Les libellés sont portés ici plutôt que par next-intl : l'envoi part parfois
 * hors d'un contexte de requête, où le dictionnaire n'est pas disponible.
 */
const RESET_TEXTES: Record<
  string,
  { sujet: string; bonjour: string; corps: string; ignorer: string; expire: (n: number) => string }
> = {
  fr: {
    sujet: "Réinitialiser votre mot de passe ticketick",
    bonjour: "Bonjour",
    corps: "Pour choisir un nouveau mot de passe, ouvrez ce lien :",
    ignorer:
      "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.",
    expire: (n) => `Ce lien est valable ${n} minutes et ne fonctionne qu'une fois.`,
  },
  en: {
    sujet: "Reset your ticketick password",
    bonjour: "Hello",
    corps: "To choose a new password, open this link:",
    ignorer:
      "If you did not request this, ignore this message: your password remains unchanged.",
    expire: (n) => `This link is valid for ${n} minutes and works only once.`,
  },
  de: {
    sujet: "ticketick-Passwort zurücksetzen",
    bonjour: "Guten Tag",
    corps: "Um ein neues Passwort zu wählen, öffnen Sie diesen Link:",
    ignorer:
      "Falls die Anfrage nicht von Ihnen stammt, ignorieren Sie diese Nachricht: Ihr Passwort bleibt unverändert.",
    expire: (n) => `Dieser Link ist ${n} Minuten gültig und funktioniert nur einmal.`,
  },
  it: {
    sujet: "Reimposta la tua password ticketick",
    bonjour: "Buongiorno",
    corps: "Per scegliere una nuova password, apri questo link:",
    ignorer:
      "Se non hai richiesto tu questa operazione, ignora il messaggio: la password resta invariata.",
    expire: (n) => `Il link è valido ${n} minuti e funziona una sola volta.`,
  },
};

export async function sendPasswordResetEmail(payload: PasswordResetPayload) {
  const l = RESET_TEXTES[payload.locale] ?? RESET_TEXTES.fr;
  const salutation = payload.name ? `${l.bonjour} ${payload.name},` : `${l.bonjour},`;

  const text = [
    salutation,
    "",
    l.corps,
    payload.url,
    "",
    l.expire(payload.expiresInMinutes),
    "",
    l.ignorer,
    "",
    "ticketick.ch",
  ].join("\n");

  const html = [
    `<p>${echapper(salutation)}</p>`,
    `<p>${echapper(l.corps)}</p>`,
    `<p><a href="${payload.url}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:#6C5CE7;color:#fff;text-decoration:none;font-weight:600">${echapper(l.sujet)}</a></p>`,
    `<p style="color:#6b7280;font-size:13px">${echapper(l.expire(payload.expiresInMinutes))}</p>`,
    `<p style="color:#6b7280;font-size:13px">${echapper(l.ignorer)}</p>`,
  ].join("");

  return envoyer({
    to: payload.to,
    subject: l.sujet,
    text,
    html: `<div style="font:14px/1.6 system-ui,sans-serif;color:#2A2C30">${html}</div>`,
    etiquette: "réinitialisation",
  });
}

/** Les valeurs insérées dans le HTML viennent en partie de la base. */
function echapper(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
