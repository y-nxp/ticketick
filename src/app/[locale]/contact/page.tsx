import { setRequestLocale } from "next-intl/server";
import { ContentPage } from "@/components/layout/content-page";

const copy: Record<string, { title: string; organizer: string; platform: string }> =
  {
    fr: {
      title: "Contact",
      organizer:
        "Pour un spectacle, un billet ou un remboursement, contactez l’organisateur (billet et e-mail de confirmation).",
      platform:
        "Pour le site ou un compte ticketick.ch : support@ticketick.ch — Lausanne, Suisse.",
    },
    en: {
      title: "Contact",
      organizer:
        "For a show, a ticket or a refund, contact the organiser (ticket and confirmation email).",
      platform:
        "For the site or a ticketick.ch account: support@ticketick.ch — Lausanne, Switzerland.",
    },
    de: {
      title: "Kontakt",
      organizer:
        "Für Vorstellung, Ticket oder Rückerstattung wenden Sie sich an den Veranstalter (Ticket und Bestätigungs-E-Mail).",
      platform:
        "Für die Website oder ein ticketick.ch-Konto: support@ticketick.ch — Lausanne, Schweiz.",
    },
    it: {
      title: "Contatto",
      organizer:
        "Per uno spettacolo, un biglietto o un rimborso, contattate l’organizzatore (biglietto e e-mail di conferma).",
      platform:
        "Per il sito o un conto ticketick.ch: support@ticketick.ch — Losanna, Svizzera.",
    },
  };

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = copy[locale] ?? copy.fr;
  return (
    <ContentPage title={c.title}>
      <p>{c.organizer}</p>
      <p>{c.platform}</p>
    </ContentPage>
  );
}
