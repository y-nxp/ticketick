/**
 * Envoi d'e-mails (confirmation de commande + billets).
 *
 * En production, configurez un transport SMTP via nodemailer :
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM
 *
 * Tant que ce n'est pas configuré, on journalise simplement l'e-mail
 * (mode développement) afin de ne pas bloquer le tunnel de commande.
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

export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
}

export async function sendTicketEmail(payload: TicketEmailPayload) {
  if (!isMailConfigured()) {
    console.info(
      "[email:mock] Confirmation envoyée à",
      payload.to,
      "— réf.",
      payload.reference,
      payload.paymentMethod === "IBAN" ? "(en attente de virement)" : "(payé)",
    );
    return { sent: true, mock: true };
  }

  // TODO (prod) : brancher nodemailer + génération PDF des billets (QR code).
  // const transporter = nodemailer.createTransport({ host, port, auth });
  // await transporter.sendMail({ from, to, subject, html, attachments: [pdf] });
  return { sent: true, mock: false };
}
