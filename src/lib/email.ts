import "server-only";

import nodemailer, { type Transporter } from "nodemailer";
import { byLocale } from "@/lib/i18n-fallback";

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
  return process.env.MAIL_FROM ?? "ticketick <ticket@ticketick.ch>";
}

export interface MailAttachment {
  filename: string;
  content: Buffer;
  cid?: string;
  contentType?: string;
}

/**
 * Expéditeur affiché au nom d'un organisateur, sur l'adresse de ticketick :
 * l'envoi reste authentifié (SPF, DKIM) et les réponses vont à l'organisateur.
 */
function expediteurAuNomDe(nom: string): string {
  const adresse = /<([^>]+)>/.exec(expediteur())?.[1] ?? expediteur();
  const propre = nom.replace(/["<>\r\n]/g, "").trim().slice(0, 80);
  return propre ? `"${propre}" <${adresse}>` : expediteur();
}

async function envoyer(options: {
  to: string;
  bcc?: string[];
  subject: string;
  text: string;
  html: string;
  attachments?: MailAttachment[];
  etiquette: string;
  /** Nom affiché comme expéditeur (organisateur), adresse ticketick. */
  fromName?: string;
  replyTo?: string;
}): Promise<{ sent: boolean; mock: boolean }> {
  const copies = options.bcc?.length ? ` (+ ${options.bcc.length} en copie cachée)` : "";
  if (!isMailConfigured()) {
    console.info(
      `[email:mock] ${options.etiquette} → ${options.to}${copies} — « ${options.subject} »`,
    );
    if (options.bcc?.length) console.info(`[email:mock] copie cachée → ${options.bcc.join(", ")}`);
    // Le contenu est journalisé en entier : sans boîte de réception, c'est le
    // seul moyen de récupérer un lien de réinitialisation en développement.
    console.info(options.text);
    return { sent: true, mock: true };
  }

  try {
    const info = await getTransport().sendMail({
      from: options.fromName ? expediteurAuNomDe(options.fromName) : expediteur(),
      replyTo: options.replyTo || undefined,
      to: options.to,
      bcc: options.bcc?.length ? options.bcc : undefined,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments,
    });
    // Le succès est journalisé autant que l'échec : sans cette trace, un
    // message parti et un message jamais tenté se ressemblent, et l'on ne
    // peut pas répondre à « je n'ai rien reçu ». Le contenu, lui, n'y figure
    // pas : un lien de réinitialisation dans un journal serait exploitable.
    console.info(
      `[email] ${options.etiquette} envoyé à ${options.to}${copies} — ${info.messageId}`,
    );
    return { sent: true, mock: false };
  } catch (error) {
    console.error(`[email] envoi impossible (${options.etiquette})`, error);
    return { sent: false, mock: false };
  }
}

// ─────────────────────────────── Billets

const COMMANDE_TEXTES: Record<
  string,
  {
    bonjour: string;
    enAttente: (ref: string) => string;
    confirmee: (ref: string) => string;
    sujetAttente: (ref: string) => string;
    sujetConfirmee: (ref: string) => string;
    virement: string;
    beneficiaire: string;
    montant: string;
    reference: string;
  }
> = {
  fr: {
    bonjour: "Bonjour",
    enAttente: (r) => `Votre commande ${r} est enregistrée. Elle sera confirmée dès réception de votre virement.`,
    confirmee: (r) => `Votre commande ${r} est confirmée.`,
    sujetAttente: (r) => `Commande ${r} — en attente de paiement`,
    sujetConfirmee: (r) => `Commande ${r} — confirmée`,
    virement: "Coordonnées pour le virement :",
    beneficiaire: "Bénéficiaire",
    montant: "Montant",
    reference: "Référence",
  },
  en: {
    bonjour: "Hello",
    enAttente: (r) => `Your order ${r} is registered. It will be confirmed as soon as your bank transfer arrives.`,
    confirmee: (r) => `Your order ${r} is confirmed.`,
    sujetAttente: (r) => `Order ${r} — awaiting payment`,
    sujetConfirmee: (r) => `Order ${r} — confirmed`,
    virement: "Bank transfer details:",
    beneficiaire: "Beneficiary",
    montant: "Amount",
    reference: "Reference",
  },
  de: {
    bonjour: "Guten Tag",
    enAttente: (r) => `Ihre Bestellung ${r} ist registriert. Sie wird bestätigt, sobald Ihre Überweisung eingegangen ist.`,
    confirmee: (r) => `Ihre Bestellung ${r} ist bestätigt.`,
    sujetAttente: (r) => `Bestellung ${r} — Zahlung ausstehend`,
    sujetConfirmee: (r) => `Bestellung ${r} — bestätigt`,
    virement: "Angaben für die Überweisung:",
    beneficiaire: "Empfänger",
    montant: "Betrag",
    reference: "Referenz",
  },
  it: {
    bonjour: "Buongiorno",
    enAttente: (r) => `Il tuo ordine ${r} è registrato. Sarà confermato non appena riceveremo il bonifico.`,
    confirmee: (r) => `Il tuo ordine ${r} è confermato.`,
    sujetAttente: (r) => `Ordine ${r} — in attesa di pagamento`,
    sujetConfirmee: (r) => `Ordine ${r} — confermato`,
    virement: "Coordinate per il bonifico:",
    beneficiaire: "Beneficiario",
    montant: "Importo",
    reference: "Riferimento",
  },
  es: {
    bonjour: "Hola",
    enAttente: (r) => `Tu pedido ${r} está registrado. Se confirmará en cuanto recibamos tu transferencia.`,
    confirmee: (r) => `Tu pedido ${r} está confirmado.`,
    sujetAttente: (r) => `Pedido ${r} — pendiente de pago`,
    sujetConfirmee: (r) => `Pedido ${r} — confirmado`,
    virement: "Datos para la transferencia:",
    beneficiaire: "Beneficiario",
    montant: "Importe",
    reference: "Referencia",
  },
};

export async function sendTicketEmail(payload: TicketEmailPayload) {
  const l = byLocale(COMMANDE_TEXTES, payload.locale);
  const lignes = payload.items
    .map((i) => `- ${i.quantity} × ${i.name}`)
    .join("\n");

  const montant = (payload.totalCents / 100).toFixed(2);
  const attente = payload.paymentMethod === "IBAN";

  const virement = payload.ibanInstructions
    ? [
        "",
        l.virement,
        `  IBAN: ${payload.ibanInstructions.iban}`,
        `  ${l.beneficiaire}: ${payload.ibanInstructions.beneficiary}`,
        `  ${l.montant}: ${montant} ${payload.currency}`,
        `  ${l.reference}: ${payload.ibanInstructions.reference}`,
      ].join("\n")
    : "";

  const text = [
    `${l.bonjour} ${payload.firstName},`,
    "",
    attente ? l.enAttente(payload.reference) : l.confirmee(payload.reference),
    "",
    lignes,
    "",
    `Total: ${montant} ${payload.currency}`,
    virement,
    "",
    "ticketick.ch",
  ].join("\n");

  return envoyer({
    to: payload.to,
    subject: attente
      ? l.sujetAttente(payload.reference)
      : l.sujetConfirmee(payload.reference),
    text,
    html: `<pre style="font:14px/1.5 system-ui">${echapper(text)}</pre>`,
    etiquette: "billets",
    attachments: [],
  });
}

export { envoyer, echapper, expediteur };

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
  es: {
    sujet: "Restablece tu contraseña de ticketick",
    bonjour: "Hola",
    corps: "Para elegir una nueva contraseña, abre este enlace:",
    ignorer:
      "Si no has sido tú quien lo ha solicitado, ignora este mensaje: tu contraseña no cambia.",
    expire: (n) => `Este enlace es válido durante ${n} minutos y solo funciona una vez.`,
  },
};

export interface OrganizerInquiryPayload {
  email: string;
  phone: string;
  format: "ONE_DAY" | "MULTI_DAY" | "MULTI_SESSION" | "UNSURE";
  message: string | null;
  locale: string;
}

const FORMAT_LIBELLES: Record<OrganizerInquiryPayload["format"], string> = {
  ONE_DAY: "un jour",
  MULTI_DAY: "plusieurs jours",
  MULTI_SESSION: "plusieurs séances",
  UNSURE: "pas encore défini",
};

function destinataireLeads(): string {
  return process.env.MAIL_TO?.trim() || "info@ticketick.ch";
}

/** Prévenez l'administrateur qu'une candidature organisateur est arrivée. */
export async function sendOrganizerInquiryEmail(
  payload: OrganizerInquiryPayload,
) {
  const format = FORMAT_LIBELLES[payload.format];
  const text = [
    "Nouvelle demande d'organisateur",
    "",
    `E-mail   : ${payload.email}`,
    `Téléphone: ${payload.phone}`,
    `Format   : ${format}`,
    payload.message ? `Message  : ${payload.message}` : "",
    `Langue   : ${payload.locale}`,
    "",
    "Prochaine étape : envoyer un créneau de rendez-vous (NetPlanify).",
    "Les accès ne s'ouvrent qu'après, depuis le compte administrateur.",
  ]
    .filter((l) => l !== "")
    .join("\n");

  return envoyer({
    to: destinataireLeads(),
    subject: `Organisateur — ${payload.email} (${format})`,
    text,
    html: `<pre style="font:14px/1.5 system-ui,sans-serif;color:#2A2C30">${echapper(text)}</pre>`,
    etiquette: "candidature organisateur",
  });
}

/** Un paiement est arrivé sur une commande dont les places sont reparties. */
export async function sendRefundAlertEmail(payload: {
  reference: string;
  amountCents: number;
  currency: string;
  provider: string;
  providerRef?: string;
}) {
  const text = [
    "Paiement à rembourser",
    "",
    `Commande : ${payload.reference}`,
    `Montant  : ${(payload.amountCents / 100).toFixed(2)} ${payload.currency}`,
    `Moyen    : ${payload.provider}${payload.providerRef ? ` (${payload.providerRef})` : ""}`,
    "",
    "Le paiement est arrivé après l'expiration de la réservation et les places",
    "ont été revendues entre-temps. Aucun billet n'a été émis : rembourser",
    "l'acheteur depuis le prestataire de paiement.",
  ].join("\n");

  return envoyer({
    to: destinataireLeads(),
    subject: `À rembourser — ${payload.reference}`,
    text,
    html: `<pre style="font:14px/1.5 system-ui,sans-serif;color:#2A2C30">${echapper(text)}</pre>`,
    etiquette: "alerte remboursement",
  });
}

export async function sendPasswordResetEmail(payload: PasswordResetPayload) {
  const l = byLocale(RESET_TEXTES, payload.locale);
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

const CONFIRMATION_TEXTES: Record<
  string,
  { sujet: string; bonjour: string; corps: string; ignorer: string; expire: (h: number) => string }
> = {
  fr: {
    sujet: "Confirmez votre adresse ticketick",
    bonjour: "Bonjour",
    corps:
      "Pour confirmer votre adresse et retrouver dans votre compte les billets achetés avec elle, ouvrez ce lien :",
    ignorer:
      "Si vous n'avez pas créé de compte ticketick, ignorez ce message : rien ne sera rattaché à cette adresse.",
    expire: (h) => `Ce lien est valable ${h} heures.`,
  },
  en: {
    sujet: "Confirm your ticketick address",
    bonjour: "Hello",
    corps:
      "To confirm your address and find the tickets bought with it in your account, open this link:",
    ignorer:
      "If you did not create a ticketick account, ignore this message: nothing will be linked to this address.",
    expire: (h) => `This link is valid for ${h} hours.`,
  },
  de: {
    sujet: "Bestätigen Sie Ihre ticketick-Adresse",
    bonjour: "Guten Tag",
    corps:
      "Um Ihre Adresse zu bestätigen und die damit gekauften Tickets in Ihrem Konto zu finden, öffnen Sie diesen Link:",
    ignorer:
      "Falls Sie kein ticketick-Konto erstellt haben, ignorieren Sie diese Nachricht: Mit dieser Adresse wird nichts verknüpft.",
    expire: (h) => `Dieser Link ist ${h} Stunden gültig.`,
  },
  it: {
    sujet: "Conferma il tuo indirizzo ticketick",
    bonjour: "Buongiorno",
    corps:
      "Per confermare l'indirizzo e ritrovare nel tuo account i biglietti acquistati con esso, apri questo link:",
    ignorer:
      "Se non hai creato un account ticketick, ignora il messaggio: nulla verrà collegato a questo indirizzo.",
    expire: (h) => `Il link è valido ${h} ore.`,
  },
  es: {
    sujet: "Confirma tu dirección en ticketick",
    bonjour: "Hola",
    corps:
      "Para confirmar tu dirección y encontrar en tu cuenta las entradas compradas con ella, abre este enlace:",
    ignorer:
      "Si no has creado una cuenta en ticketick, ignora este mensaje: no se vinculará nada a esta dirección.",
    expire: (h) => `Este enlace es válido durante ${h} horas.`,
  },
};

export async function sendEmailConfirmation(payload: {
  to: string;
  name: string | null;
  locale: string;
  url: string;
  expiresInHours: number;
}) {
  const l = byLocale(CONFIRMATION_TEXTES, payload.locale);
  const salutation = payload.name ? `${l.bonjour} ${payload.name},` : `${l.bonjour},`;

  const text = [
    salutation,
    "",
    l.corps,
    payload.url,
    "",
    l.expire(payload.expiresInHours),
    "",
    l.ignorer,
    "",
    "ticketick.ch",
  ].join("\n");

  const html = [
    `<p>${echapper(salutation)}</p>`,
    `<p>${echapper(l.corps)}</p>`,
    `<p><a href="${payload.url}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:#6C5CE7;color:#fff;text-decoration:none;font-weight:600">${echapper(l.sujet)}</a></p>`,
    `<p style="color:#6b7280;font-size:13px">${echapper(l.expire(payload.expiresInHours))}</p>`,
    `<p style="color:#6b7280;font-size:13px">${echapper(l.ignorer)}</p>`,
  ].join("");

  return envoyer({
    to: payload.to,
    subject: l.sujet,
    text,
    html: `<div style="font:14px/1.6 system-ui,sans-serif;color:#2A2C30">${html}</div>`,
    etiquette: "confirmation d'adresse",
  });
}

const INVITATION_TEXTES: Record<
  string,
  {
    sujet: (org: string) => string;
    bonjour: string;
    corps: (org: string) => string;
    bouton: string;
    expire: (d: number) => string;
  }
> = {
  fr: {
    sujet: (org) => `Accès aux ventes — ${org}`,
    bonjour: "Bonjour",
    corps: (org) =>
      `${org} vous invite à consulter ses ventes de billets sur ticketick. Pour activer votre accès, choisissez votre mot de passe :`,
    bouton: "Choisir mon mot de passe",
    expire: (d) => `Ce lien est valable ${d} jours et ne fonctionne qu'une fois.`,
  },
  en: {
    sujet: (org) => `Access to sales — ${org}`,
    bonjour: "Hello",
    corps: (org) =>
      `${org} invites you to view its ticket sales on ticketick. To activate your access, choose your password:`,
    bouton: "Choose my password",
    expire: (d) => `This link is valid for ${d} days and works only once.`,
  },
  de: {
    sujet: (org) => `Zugang zu den Verkäufen — ${org}`,
    bonjour: "Guten Tag",
    corps: (org) =>
      `${org} lädt Sie ein, die Ticketverkäufe auf ticketick einzusehen. Um Ihren Zugang zu aktivieren, wählen Sie Ihr Passwort:`,
    bouton: "Passwort wählen",
    expire: (d) => `Dieser Link ist ${d} Tage gültig und funktioniert nur einmal.`,
  },
  it: {
    sujet: (org) => `Accesso alle vendite — ${org}`,
    bonjour: "Buongiorno",
    corps: (org) =>
      `${org} ti invita a consultare le vendite di biglietti su ticketick. Per attivare l'accesso, scegli la tua password:`,
    bouton: "Scegli la password",
    expire: (d) => `Il link è valido ${d} giorni e funziona una sola volta.`,
  },
};

export async function sendStatsInvitationEmail(payload: {
  to: string;
  name: string | null;
  locale: string;
  organizerName: string;
  url: string;
  expiresInDays: number;
}) {
  const l = byLocale(INVITATION_TEXTES, payload.locale);
  const salutation = payload.name ? `${l.bonjour} ${payload.name},` : `${l.bonjour},`;
  const corps = l.corps(payload.organizerName);

  const text = [
    salutation,
    "",
    corps,
    payload.url,
    "",
    l.expire(payload.expiresInDays),
    "",
    "ticketick.ch",
  ].join("\n");

  const html = [
    `<p>${echapper(salutation)}</p>`,
    `<p>${echapper(corps)}</p>`,
    `<p><a href="${payload.url}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:#6C5CE7;color:#fff;text-decoration:none;font-weight:600">${echapper(l.bouton)}</a></p>`,
    `<p style="color:#6b7280;font-size:13px">${echapper(l.expire(payload.expiresInDays))}</p>`,
  ].join("");

  return envoyer({
    to: payload.to,
    subject: l.sujet(payload.organizerName),
    text,
    html: `<div style="font:14px/1.6 system-ui,sans-serif;color:#2A2C30">${html}</div>`,
    etiquette: "invitation responsable",
  });
}

const AGENT_INVITATION_TEXTES: Record<
  string,
  {
    sujet: (pos: string) => string;
    bonjour: string;
    corps: (pos: string) => string;
    bouton: string;
    expire: (jours: number) => string;
  }
> = {
  fr: {
    sujet: (pos) => `Accès vendeur — ${pos}`,
    bonjour: "Bonjour",
    corps: (pos) =>
      `Vous êtes invité à vendre des billets sur ticketick pour le point de vente ${pos}. Pour activer votre accès, choisissez votre mot de passe :`,
    bouton: "Choisir mon mot de passe",
    expire: (d) => `Ce lien est valable ${d} jours et ne fonctionne qu'une fois.`,
  },
  en: {
    sujet: (pos) => `Seller access — ${pos}`,
    bonjour: "Hello",
    corps: (pos) =>
      `You are invited to sell tickets on ticketick for the point of sale ${pos}. To activate your access, choose your password:`,
    bouton: "Choose my password",
    expire: (d) => `This link is valid for ${d} days and works only once.`,
  },
  de: {
    sujet: (pos) => `Verkaufszugang — ${pos}`,
    bonjour: "Guten Tag",
    corps: (pos) =>
      `Sie sind eingeladen, auf ticketick Tickets für die Verkaufsstelle ${pos} zu verkaufen. Um Ihren Zugang zu aktivieren, wählen Sie Ihr Passwort:`,
    bouton: "Passwort wählen",
    expire: (d) => `Dieser Link ist ${d} Tage gültig und funktioniert nur einmal.`,
  },
  it: {
    sujet: (pos) => `Accesso venditore — ${pos}`,
    bonjour: "Buongiorno",
    corps: (pos) =>
      `Sei invitato a vendere biglietti su ticketick per il punto vendita ${pos}. Per attivare l'accesso, scegli la tua password:`,
    bouton: "Scegli la password",
    expire: (d) => `Il link è valido ${d} giorni e funziona una sola volta.`,
  },
};

export async function sendResellerAgentInvitationEmail(payload: {
  to: string;
  name: string | null;
  locale: string;
  resellerName: string;
  url: string;
  expiresInDays: number;
}) {
  const l = byLocale(AGENT_INVITATION_TEXTES, payload.locale);
  const salutation = payload.name ? `${l.bonjour} ${payload.name},` : `${l.bonjour},`;
  const corps = l.corps(payload.resellerName);
  const text = [
    salutation,
    "",
    corps,
    payload.url,
    "",
    l.expire(payload.expiresInDays),
    "",
    "ticketick.ch",
  ].join("\n");
  const html = [
    `<p>${echapper(salutation)}</p>`,
    `<p>${echapper(corps)}</p>`,
    `<p><a href="${payload.url}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#6C5CE7;color:#fff;text-decoration:none;font-weight:600">${echapper(l.bouton)}</a></p>`,
    `<p style="color:#6b7280;font-size:13px">${echapper(l.expire(payload.expiresInDays))}</p>`,
  ].join("");
  return envoyer({
    to: payload.to,
    subject: l.sujet(payload.resellerName),
    text,
    html: `<div style="font:14px/1.6 system-ui,sans-serif;color:#2A2C30">${html}</div>`,
    etiquette: "invitation vendeur",
  });
}

/** Rapport en tableau (point de vente, invitations) : libellés et montants déjà formatés. */
export interface TableReportPayload {
  to: string;
  bcc?: string[];
  subject: string;
  heading: string;
  period: string;
  columns: string[];
  rows: string[][];
  emptyRows: string;
  summaryTitle: string;
  summary: { label: string; value: string }[];
  footer: string;
  url: string;
  button: string;
}

export function sendResellerReportEmail(payload: TableReportPayload) {
  return sendTableReportEmail(payload, "récapitulatif point de vente");
}

export async function sendTableReportEmail(payload: TableReportPayload, etiquette: string) {
  const cell = "padding:6px 8px;border-bottom:1px solid #e5e7eb";
  const right = `${cell};text-align:right;white-space:nowrap`;
  const table = payload.rows.length
    ? [
        `<table style="border-collapse:collapse;width:100%;font-size:13px">`,
        `<tr>${payload.columns
          .map((c, i) => `<th style="${i === 0 ? cell : right};text-align:${i === 0 ? "left" : "right"};color:#6b7280;font-weight:600">${echapper(c)}</th>`)
          .join("")}</tr>`,
        ...payload.rows.map(
          (r) =>
            `<tr>${r.map((v, i) => `<td style="${i === 0 ? cell : right}">${echapper(v)}</td>`).join("")}</tr>`,
        ),
        `</table>`,
      ].join("")
    : `<p style="color:#6b7280">${echapper(payload.emptyRows)}</p>`;
  const summary = [
    `<table style="border-collapse:collapse;font-size:13px">`,
    ...payload.summary.map(
      (s) =>
        `<tr><td style="padding:3px 16px 3px 0;color:#6b7280">${echapper(s.label)}</td><td style="padding:3px 0;text-align:right;font-weight:600">${echapper(s.value)}</td></tr>`,
    ),
    `</table>`,
  ].join("");
  const html = [
    `<p style="font-size:16px;font-weight:600;margin:0">${echapper(payload.heading)}</p>`,
    `<p style="color:#6b7280;margin:2px 0 16px">${echapper(payload.period)}</p>`,
    table,
    `<p style="font-weight:600;margin:20px 0 6px">${echapper(payload.summaryTitle)}</p>`,
    summary,
    `<p style="margin-top:20px"><a href="${payload.url}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#6C5CE7;color:#fff;text-decoration:none;font-weight:600">${echapper(payload.button)}</a></p>`,
    `<p style="color:#6b7280;font-size:12px">${echapper(payload.footer)}</p>`,
  ].join("");
  const text = [
    payload.heading,
    payload.period,
    "",
    ...(payload.rows.length
      ? payload.rows.map(
          (r) => `${r[0]} — ${payload.columns.slice(1).map((c, i) => `${c} ${r[i + 1]}`).join(" · ")}`,
        )
      : [payload.emptyRows]),
    "",
    payload.summaryTitle,
    ...payload.summary.map((s) => `${s.label} : ${s.value}`),
    "",
    payload.url,
    "",
    payload.footer,
  ].join("\n");
  return envoyer({
    to: payload.to,
    bcc: payload.bcc,
    subject: payload.subject,
    text,
    html: `<div style="font:14px/1.6 system-ui,sans-serif;color:#2A2C30;max-width:640px">${html}</div>`,
    etiquette,
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
