import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  Armchair,
  BarChart3,
  CreditCard,
  Globe,
  Mail,
  Megaphone,
  Repeat,
  ScanLine,
  ShieldCheck,
  Store,
  Ticket,
  Users,
} from "lucide-react";
import { InquiryChat } from "./inquiry-chat";
import { byLocale } from "@/lib/i18n-fallback";
import { pageAlternates } from "@/lib/seo/site";

// Ce que l'application fait pour un organisateur, telle qu'elle est aujourd'hui (pas de promesse).
// L'espace reste ouvert après un rendez-vous : la page argumente, le fil de contact conclut.
const content = {
  fr: {
    lead: "Une billetterie suisse complète, que nous mettons en place avec vous.",
    featuresTitle: "Ce que ticketick fait pour vous",
    features: [
      { t: "Vente en ligne en cinq langues", d: "Page de spectacle en français, allemand, italien, anglais et espagnol, photos, programme, référencement soigné. Module intégrable à votre propre site." },
      { t: "Placement libre ou numéroté", d: "Plan de salle sur mesure, zones et catégories de prix, visibilité réduite signalée sur le plan et le billet, places bloquées pour vos invités, places contiguës attribuées d'office." },
      { t: "Paiement sur vos comptes", d: "Carte par PostFinance ou Stripe, PayPal, virement et lien de paiement par e-mail. L'argent arrive chez vous, pas chez nous. Codes de rabais et tarifs à conditions." },
      { t: "Billets par e-mail", d: "Billets PDF avec QR, nominatifs si vous le souhaitez, dans la langue de l'acheteur. Copie à vos adresses à chaque vente." },
      { t: "Contrôle d'entrée", d: "Application sur le téléphone de vos contrôleurs : scan du QR ou saisie du code, compteur entrés / attendus, vérification de l'identité pour les tarifs réduits." },
      { t: "Guichet et invitations", d: "Réservation au guichet : offerte, en espèces, par virement, à payer sur place ou par lien de paiement, avec choix des places sur le plan. Invitations suivies, avec rapport." },
      { t: "Points de vente partenaires", d: "Offices du tourisme, boutiques, guichets : un espace vendeur par point de vente, ventes en espèces, au terminal ou par carte, commissions par spectacle et décomptes." },
      { t: "Clients autonomes", d: "Changement de séance ou de place, ajout de billets et annulation des gratuités par le client lui-même, depuis son compte ou un lien que vous envoyez. Différence payée par carte." },
      { t: "Suivi, rapports et équipe", d: "Tableau de bord des ventes, rapports de ventes et d'invitations par e-mail, quotidiens ou hebdomadaires. Équipe avec rôles, connexion par code reçu par e-mail." },
      { t: "Mesure d'audience", d: "Google Analytics, Google Ads et pixel Meta sur vos spectacles, avec le consentement des visiteurs. Statistiques sans cookie en complément." },
      { t: "Hébergé en Suisse", d: "Plateforme conçue et opérée en Suisse, données en Suisse, sauvegardes hors site. Un interlocuteur réel en français, allemand, anglais ou italien." },
      { t: "Mise en place accompagnée", d: "Personne n'ouvre son espace tout seul : on se parle, on configure vos spectacles avec vous, et nous restons à côté jusqu'au soir de la représentation." },
    ],
    stepsTitle: "Comment on démarre",
    steps: [
      { t: "On se parle", d: "Vous décrivez votre projet ci-dessous, nous vous rappelons pour un rendez-vous." },
      { t: "On ouvre votre espace", d: "Spectacles, plan de salle, tarifs et moyens de paiement sont configurés avec vous. Un spectacle simple se prépare en quelques jours." },
      { t: "Vous vendez", d: "Vos clients achètent en ligne, au guichet ou chez vos points de vente. Vous suivez tout depuis votre espace." },
    ],
    contactTitle: "Parlons de votre événement",
  },
  en: {
    lead: "A complete Swiss ticketing platform, set up together with you.",
    featuresTitle: "What ticketick does for you",
    features: [
      { t: "Online sales in five languages", d: "Event page in French, German, Italian, English and Spanish, with photos, programme and careful SEO. A module you can embed in your own website." },
      { t: "Free or numbered seating", d: "Custom seating plan, zones and price categories, restricted views flagged on the plan and the ticket, seats blocked for your guests, adjacent seats assigned automatically." },
      { t: "Payments to your accounts", d: "Cards via PostFinance or Stripe, PayPal, bank transfer and payment links by e-mail. The money goes to you, not to us. Discount codes and conditional fares." },
      { t: "Tickets by e-mail", d: "PDF tickets with a QR code, named if you wish, in the buyer's language. A copy to your addresses on every sale." },
      { t: "Entrance control", d: "An app on your stewards' phones: QR scan or code entry, admitted / expected counter, ID check for reduced fares." },
      { t: "Box office and invitations", d: "Box office bookings: free, cash, bank transfer, pay at the door or by payment link, with seats picked on the plan. Invitations tracked, with a report." },
      { t: "Partner points of sale", d: "Tourist offices, shops, counters: a seller space per point of sale, cash, terminal or card sales, commissions per event and settlements." },
      { t: "Self-service customers", d: "Customers change session or seat, add tickets and cancel free seats themselves, from their account or a link you send. Any difference is paid by card." },
      { t: "Tracking, reports and team", d: "Sales dashboard, sales and invitation reports by e-mail, daily or weekly. A team with roles, login by code received by e-mail." },
      { t: "Audience measurement", d: "Google Analytics, Google Ads and the Meta pixel on your events, with visitor consent. Cookieless statistics on top." },
      { t: "Hosted in Switzerland", d: "Platform designed and operated in Switzerland, data in Switzerland, off-site backups. A real contact in French, German, English or Italian." },
      { t: "Guided setup", d: "Nobody opens their space alone: we talk, we configure your events with you, and we stay by your side until show night." },
    ],
    stepsTitle: "How we start",
    steps: [
      { t: "We talk", d: "Describe your project below and we call you back for an appointment." },
      { t: "We open your space", d: "Events, seating plan, fares and payment methods are set up with you. A simple event is ready in a few days." },
      { t: "You sell", d: "Your customers buy online, at the box office or from your points of sale. You follow everything from your space." },
    ],
    contactTitle: "Let's talk about your event",
  },
  de: {
    lead: "Ein komplettes Schweizer Ticketing, das wir gemeinsam mit Ihnen einrichten.",
    featuresTitle: "Was ticketick für Sie tut",
    features: [
      { t: "Online-Verkauf in fünf Sprachen", d: "Veranstaltungsseite auf Deutsch, Französisch, Italienisch, Englisch und Spanisch, mit Fotos, Programm und sorgfältiger Suchmaschinenoptimierung. Als Modul in Ihre eigene Website einbettbar." },
      { t: "Freie oder nummerierte Plätze", d: "Massgeschneiderter Saalplan, Zonen und Preiskategorien, eingeschränkte Sicht auf Plan und Ticket vermerkt, gesperrte Plätze für Ihre Gäste, zusammenhängende Plätze automatisch vergeben." },
      { t: "Zahlungen auf Ihre Konten", d: "Karte über PostFinance oder Stripe, PayPal, Überweisung und Zahlungslink per E-Mail. Das Geld geht an Sie, nicht an uns. Rabattcodes und Tarife mit Bedingungen." },
      { t: "Tickets per E-Mail", d: "PDF-Tickets mit QR-Code, auf Wunsch personalisiert, in der Sprache des Käufers. Kopie an Ihre Adressen bei jedem Verkauf." },
      { t: "Einlasskontrolle", d: "App auf dem Telefon Ihrer Kontrolleure: QR-Scan oder Codeeingabe, Zähler eingelassen / erwartet, Ausweiskontrolle für ermässigte Tarife." },
      { t: "Kasse und Einladungen", d: "Reservation an der Kasse: gratis, bar, per Überweisung, vor Ort zu zahlen oder per Zahlungslink, mit Platzwahl auf dem Plan. Einladungen werden verfolgt, mit Bericht." },
      { t: "Partner-Verkaufsstellen", d: "Tourismusbüros, Läden, Schalter: ein Verkäuferbereich pro Verkaufsstelle, Verkauf bar, am Terminal oder per Karte, Kommissionen pro Veranstaltung und Abrechnungen." },
      { t: "Selbstständige Kunden", d: "Kunden wechseln Vorstellung oder Platz, kaufen Tickets dazu und stornieren Gratisplätze selbst, aus ihrem Konto oder über einen Link von Ihnen. Die Differenz wird per Karte bezahlt." },
      { t: "Übersicht, Berichte und Team", d: "Verkaufs-Dashboard, Verkaufs- und Einladungsberichte per E-Mail, täglich oder wöchentlich. Team mit Rollen, Anmeldung per Code aus der E-Mail." },
      { t: "Reichweitenmessung", d: "Google Analytics, Google Ads und Meta-Pixel auf Ihren Veranstaltungen, mit Einwilligung der Besucher. Dazu Statistiken ohne Cookies." },
      { t: "In der Schweiz gehostet", d: "Plattform in der Schweiz entwickelt und betrieben, Daten in der Schweiz, Backups ausser Haus. Eine echte Ansprechperson auf Deutsch, Französisch, Englisch oder Italienisch." },
      { t: "Begleitete Einrichtung", d: "Niemand eröffnet seinen Bereich allein: wir sprechen miteinander, richten Ihre Veranstaltungen mit Ihnen ein und bleiben bis zum Vorstellungsabend an Ihrer Seite." },
    ],
    stepsTitle: "So starten wir",
    steps: [
      { t: "Wir sprechen", d: "Beschreiben Sie unten Ihr Projekt, wir rufen Sie für einen Termin zurück." },
      { t: "Wir eröffnen Ihren Bereich", d: "Veranstaltungen, Saalplan, Tarife und Zahlungsmittel werden mit Ihnen eingerichtet. Eine einfache Veranstaltung ist in wenigen Tagen bereit." },
      { t: "Sie verkaufen", d: "Ihre Kunden kaufen online, an der Kasse oder bei Ihren Verkaufsstellen. Sie verfolgen alles in Ihrem Bereich." },
    ],
    contactTitle: "Sprechen wir über Ihre Veranstaltung",
  },
  it: {
    lead: "Una biglietteria svizzera completa, che mettiamo in piedi insieme a voi.",
    featuresTitle: "Cosa fa ticketick per voi",
    features: [
      { t: "Vendita online in cinque lingue", d: "Pagina dello spettacolo in italiano, francese, tedesco, inglese e spagnolo, con foto, programma e SEO curata. Modulo integrabile nel vostro sito." },
      { t: "Posti liberi o numerati", d: "Pianta della sala su misura, zone e categorie di prezzo, visibilità ridotta segnalata sulla pianta e sul biglietto, posti bloccati per i vostri invitati, posti contigui assegnati automaticamente." },
      { t: "Pagamenti sui vostri conti", d: "Carta tramite PostFinance o Stripe, PayPal, bonifico e link di pagamento via e-mail. Il denaro arriva a voi, non a noi. Codici sconto e tariffe a condizioni." },
      { t: "Biglietti via e-mail", d: "Biglietti PDF con QR, nominativi se lo desiderate, nella lingua dell'acquirente. Copia ai vostri indirizzi a ogni vendita." },
      { t: "Controllo all'ingresso", d: "App sul telefono dei vostri controllori: scansione del QR o inserimento del codice, contatore entrati / attesi, verifica dell'identità per le tariffe ridotte." },
      { t: "Cassa e inviti", d: "Prenotazione in cassa: gratuita, in contanti, con bonifico, da pagare sul posto o con link di pagamento, con scelta dei posti sulla pianta. Inviti tracciati, con rapporto." },
      { t: "Punti vendita partner", d: "Uffici del turismo, negozi, sportelli: uno spazio venditore per punto vendita, vendite in contanti, al terminale o con carta, commissioni per spettacolo e rendiconti." },
      { t: "Clienti autonomi", d: "Cambio di recita o di posto, aggiunta di biglietti e annullamento delle gratuità da parte del cliente stesso, dal suo conto o da un link che inviate. La differenza si paga con carta." },
      { t: "Monitoraggio, rapporti e team", d: "Cruscotto delle vendite, rapporti di vendite e inviti via e-mail, giornalieri o settimanali. Team con ruoli, accesso con codice ricevuto via e-mail." },
      { t: "Misurazione del pubblico", d: "Google Analytics, Google Ads e pixel Meta sui vostri spettacoli, con il consenso dei visitatori. Statistiche senza cookie in aggiunta." },
      { t: "Ospitato in Svizzera", d: "Piattaforma progettata e gestita in Svizzera, dati in Svizzera, backup fuori sede. Un interlocutore reale in italiano, francese, tedesco o inglese." },
      { t: "Avvio accompagnato", d: "Nessuno apre il proprio spazio da solo: ci parliamo, configuriamo i vostri spettacoli con voi e restiamo al vostro fianco fino alla sera della recita." },
    ],
    stepsTitle: "Come si comincia",
    steps: [
      { t: "Ci parliamo", d: "Descrivete il vostro progetto qui sotto, vi richiamiamo per un appuntamento." },
      { t: "Apriamo il vostro spazio", d: "Spettacoli, pianta della sala, tariffe e mezzi di pagamento sono configurati con voi. Uno spettacolo semplice è pronto in pochi giorni." },
      { t: "Vendete", d: "I vostri clienti acquistano online, in cassa o nei vostri punti vendita. Seguite tutto dal vostro spazio." },
    ],
    contactTitle: "Parliamo del vostro evento",
  },
} as const;

type Content = (typeof content)[keyof typeof content];

const icons = [Globe, Armchair, CreditCard, Mail, ScanLine, Ticket, Store, Repeat, BarChart3, Megaphone, ShieldCheck, Users];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "organizer" });
  const tm = await getTranslations({ locale, namespace: "meta" });
  return {
    title: t("title"),
    description: tm("organizerDescription"),
    alternates: pageAlternates("/organizer", locale),
  };
}

export default async function OrganizerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("organizer");
  const c = byLocale<Content>(content, locale);

  return (
    <div className="container-page py-12">
      <div className="max-w-2xl">
        <span className="inline-flex items-center rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium">
          {t("title")}
        </span>
        <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">{t("hero")}</h1>
        <p className="mt-4 text-lg text-muted-foreground">{c.lead}</p>
      </div>

      <section className="mt-14" aria-labelledby="organizer-features">
        <h2 id="organizer-features" className="text-2xl font-bold tracking-tight">
          {c.featuresTitle}
        </h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {c.features.map((f, i) => {
            const Icon = icons[i];
            return (
              <div key={f.t} className="rounded-card border border-border bg-card p-5">
                <div className="grid size-11 place-items-center rounded-control bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <h3 className="mt-4 font-semibold">{f.t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-14" aria-labelledby="organizer-steps">
        <h2 id="organizer-steps" className="text-2xl font-bold tracking-tight">
          {c.stepsTitle}
        </h2>
        <ol className="mt-6 grid gap-5 sm:grid-cols-3">
          {c.steps.map((s, i) => (
            <li key={s.t} className="relative rounded-card border border-border bg-card p-5">
              <span className="absolute right-4 top-3 text-3xl font-bold text-secondary">{i + 1}</span>
              <h3 className="font-semibold">{s.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="contact" className="mt-14 max-w-2xl" aria-labelledby="organizer-contact">
        <h2 id="organizer-contact" className="text-2xl font-bold tracking-tight">
          {c.contactTitle}
        </h2>
        <p className="mt-2 text-muted-foreground">{t("heroSubtitle")}</p>
        <div className="mt-6 rounded-card border border-border bg-card p-6 shadow-sm sm:p-8">
          <InquiryChat />
        </div>
      </section>
    </div>
  );
}
