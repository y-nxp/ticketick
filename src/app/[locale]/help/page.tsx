import { setRequestLocale } from "next-intl/server";
import { ContentPage } from "@/components/layout/content-page";

const copy: Record<
  string,
  { title: string; organizer: string; platform: string; email: string }
> = {
  fr: {
    title: "Centre d'aide",
    organizer:
      "Pour un spectacle, un billet, un remboursement ou l’accès : contactez l’organisateur. Ses coordonnées figurent sur le billet et dans l’e-mail de confirmation. ticketick n’est pas partie au contrat de spectacle et ne traite pas ces demandes.",
    platform:
      "Pour un problème technique du site ou de votre compte ticketick.ch :",
    email: "support@ticketick.ch",
  },
  en: {
    title: "Help center",
    organizer:
      "For a show, a ticket, a refund or admission: contact the organiser. Their details are on the ticket and in the confirmation email. ticketick is not party to the event contract and does not handle those requests.",
    platform: "For a technical issue with the site or your ticketick.ch account:",
    email: "support@ticketick.ch",
  },
  de: {
    title: "Hilfezentrum",
    organizer:
      "Für Vorstellung, Ticket, Rückerstattung oder Einlass: wenden Sie sich an den Veranstalter. Die Angaben stehen auf dem Ticket und in der Bestätigungs-E-Mail. ticketick ist nicht Vertragspartner der Vorstellung und bearbeitet solche Anfragen nicht.",
    platform:
      "Bei einem technischen Problem der Website oder Ihres ticketick.ch-Kontos:",
    email: "support@ticketick.ch",
  },
  it: {
    title: "Centro assistenza",
    organizer:
      "Per uno spettacolo, un biglietto, un rimborso o l’accesso: contattate l’organizzatore. I recapiti sono sul biglietto e nella e-mail di conferma. ticketick non è parte del contratto di spettacolo e non tratta tali richieste.",
    platform:
      "Per un problema tecnico del sito o del vostro conto ticketick.ch:",
    email: "support@ticketick.ch",
  },
};

export default async function HelpPage({
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
      <p>
        <a
          className="font-medium text-foreground underline-offset-4 hover:underline"
          href={`mailto:${c.email}`}
        >
          {c.email}
        </a>
      </p>
    </ContentPage>
  );
}
