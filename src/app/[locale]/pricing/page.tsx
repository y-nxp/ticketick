import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { ArrowRight, Check } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { byLocale } from "@/lib/i18n-fallback";
import {
  chf,
  COMPLEX_SEATING_PLAN_CENTS,
  EXAMPLE_TICKET_PRICES_CENTS,
  percentLabel,
  PLATFORM_FEES,
  platformFeeCents,
  type PlatformPlan,
} from "@/lib/pricing/platform-fees";
import { pageAlternates } from "@/lib/seo/site";

// Les montants viennent de `platform-fees.ts` ; ici, seulement les mots.
// `{plan}` est remplacé par le prix du plan de salle complexe.
const content = {
  fr: {
    badge: "Tarifs",
    title: "Des tarifs clairs, sans abonnement",
    description:
      "Tarifs de la billetterie ticketick : gratuit pour les événements gratuits, CHF 0.50 + 1,8 % par billet en libre-service, CHF 0.90 + 3,5 % avec accompagnement.",
    lead: "Vous ne payez que sur les billets payants vendus. Pas d'abonnement, pas de frais d'ouverture, pas d'engagement.",
    perTicket: "par billet payant vendu",
    recommended: "Avec accompagnement",
    free: {
      name: "Événements gratuits",
      price: "CHF 0",
      unit: "billets gratuits et inscriptions",
      lead: "Pour les entrées libres, les inscriptions et les invitations.",
      items: ["Toutes les fonctions de la billetterie", "Contrôle d'entrée sur téléphone", "Aide en ligne, sans assistance personnelle"],
    },
    selfService: {
      name: "Libre-service",
      lead: "Vous configurez tout vous-même, au prix le plus bas.",
      items: [
        "Nous ouvrons votre espace, vous créez vos événements",
        "Toutes les fonctions : places numérotées, billets par e-mail, guichet, contrôle d'entrée",
        "Aide en ligne, sans assistance personnelle",
      ],
    },
    premium: {
      name: "Premium",
      lead: "Nous mettons tout en place et restons à vos côtés.",
      items: [
        "Mise en place faite par nous : événement, tarifs, plan de salle simple",
        "Formation de votre équipe en visioconférence",
        "Assistance par e-mail et par téléphone, les jours ouvrables",
        "Assistance à distance le jour de l'événement",
      ],
    },
    full: {
      name: "Organisation complète",
      price: "Sur devis",
      unit: "billetterie Premium comprise",
      lead: "Vous nous confiez l'organisation de votre événement.",
      items: ["Billetterie, communication et coordination, selon vos besoins", "Un seul interlocuteur du début à la fin", "Offre établie après un premier échange"],
    },
    examplesTitle: "Ce que cela représente par billet",
    examplesTicket: "Prix du billet",
    notesTitle: "Bon à savoir",
    notes: [
      "L'argent des ventes arrive directement sur votre compte PostFinance ou Stripe. Les frais de carte et de TWINT sont ceux de votre prestataire de paiement : vous les réglez avec lui.",
      "La commission ticketick vous est facturée après l'événement ; pour une saison, chaque mois.",
      "Plan de salle numéroté complexe (balcons, plusieurs niveaux) : CHF {plan}, une seule fois.",
      "Tous les prix s'entendent hors TVA.",
    ],
    ctaTitle: "Un événement en vue ?",
    ctaLead: "Dites-nous ce que vous organisez : nous ouvrons votre espace et vous indiquons la formule qui convient.",
    cta: "Parler de mon événement",
  },
  en: {
    badge: "Pricing",
    title: "Clear pricing, no subscription",
    description:
      "ticketick ticketing prices: free for free events, CHF 0.50 + 1.8% per ticket self-service, CHF 0.90 + 3.5% with full support.",
    lead: "You only pay on paid tickets sold. No subscription, no setup fee, no commitment.",
    perTicket: "per paid ticket sold",
    recommended: "With support",
    free: {
      name: "Free events",
      price: "CHF 0",
      unit: "free tickets and registrations",
      lead: "For free admission, registrations and invitations.",
      items: ["Every ticketing feature", "Entrance control on a phone", "Online help, no personal support"],
    },
    selfService: {
      name: "Self-service",
      lead: "You set everything up yourself, at the lowest price.",
      items: [
        "We open your space, you create your events",
        "Every feature: numbered seating, tickets by e-mail, box office, entrance control",
        "Online help, no personal support",
      ],
    },
    premium: {
      name: "Premium",
      lead: "We set everything up and stay by your side.",
      items: [
        "Setup done by us: event, fares, simple seating plan",
        "Training for your team by video call",
        "Support by e-mail and phone on working days",
        "Remote support on the day of the event",
      ],
    },
    full: {
      name: "Full event organisation",
      price: "On quote",
      unit: "Premium ticketing included",
      lead: "You entrust us with organising your event.",
      items: ["Ticketing, communication and coordination, as you need", "One contact from start to finish", "Quote prepared after a first conversation"],
    },
    examplesTitle: "What it means per ticket",
    examplesTicket: "Ticket price",
    notesTitle: "Good to know",
    notes: [
      "Sales revenue goes straight to your PostFinance or Stripe account. Card and TWINT fees are those of your payment provider: you settle them with it.",
      "The ticketick commission is invoiced after the event; monthly for a season.",
      "Complex numbered seating plan (balconies, several levels): CHF {plan}, one-off.",
      "All prices exclude VAT.",
    ],
    ctaTitle: "An event coming up?",
    ctaLead: "Tell us what you are organising: we open your space and point you to the plan that fits.",
    cta: "Talk about my event",
  },
  de: {
    badge: "Preise",
    title: "Klare Preise, kein Abonnement",
    description:
      "Preise des ticketick-Ticketings: gratis für Gratisanlässe, CHF 0.50 + 1.8% pro Ticket in Selbstbedienung, CHF 0.90 + 3.5% mit Begleitung.",
    lead: "Sie zahlen nur für verkaufte, kostenpflichtige Tickets. Kein Abonnement, keine Einrichtungsgebühr, keine Bindung.",
    perTicket: "pro verkauftes, kostenpflichtiges Ticket",
    recommended: "Mit Begleitung",
    free: {
      name: "Gratisanlässe",
      price: "CHF 0",
      unit: "Gratistickets und Anmeldungen",
      lead: "Für freien Eintritt, Anmeldungen und Einladungen.",
      items: ["Alle Funktionen des Ticketings", "Einlasskontrolle mit dem Telefon", "Online-Hilfe, keine persönliche Betreuung"],
    },
    selfService: {
      name: "Selbstbedienung",
      lead: "Sie richten alles selbst ein, zum tiefsten Preis.",
      items: [
        "Wir eröffnen Ihren Bereich, Sie erfassen Ihre Veranstaltungen",
        "Alle Funktionen: nummerierte Plätze, Tickets per E-Mail, Kasse, Einlasskontrolle",
        "Online-Hilfe, keine persönliche Betreuung",
      ],
    },
    premium: {
      name: "Premium",
      lead: "Wir richten alles ein und bleiben an Ihrer Seite.",
      items: [
        "Einrichtung durch uns: Veranstaltung, Tarife, einfacher Saalplan",
        "Schulung Ihres Teams per Videokonferenz",
        "Betreuung per E-Mail und Telefon an Werktagen",
        "Fernunterstützung am Veranstaltungstag",
      ],
    },
    full: {
      name: "Komplette Organisation",
      price: "Auf Offerte",
      unit: "Premium-Ticketing inbegriffen",
      lead: "Sie übergeben uns die Organisation Ihrer Veranstaltung.",
      items: ["Ticketing, Kommunikation und Koordination, je nach Bedarf", "Eine Ansprechperson von Anfang bis Ende", "Offerte nach einem ersten Gespräch"],
    },
    examplesTitle: "Was das pro Ticket bedeutet",
    examplesTicket: "Ticketpreis",
    notesTitle: "Gut zu wissen",
    notes: [
      "Die Einnahmen gehen direkt auf Ihr PostFinance- oder Stripe-Konto. Karten- und TWINT-Gebühren sind jene Ihres Zahlungsanbieters: Sie rechnen sie mit ihm ab.",
      "Die ticketick-Kommission wird nach der Veranstaltung verrechnet, bei einer Saison monatlich.",
      "Komplexer nummerierter Saalplan (Balkone, mehrere Ebenen): CHF {plan}, einmalig.",
      "Alle Preise verstehen sich ohne MWST.",
    ],
    ctaTitle: "Eine Veranstaltung in Sicht?",
    ctaLead: "Sagen Sie uns, was Sie organisieren: Wir eröffnen Ihren Bereich und nennen Ihnen das passende Angebot.",
    cta: "Über meine Veranstaltung sprechen",
  },
  it: {
    badge: "Tariffe",
    title: "Tariffe chiare, senza abbonamento",
    description:
      "Tariffe della biglietteria ticketick: gratuita per gli eventi gratuiti, CHF 0.50 + 1,8% per biglietto in self-service, CHF 0.90 + 3,5% con accompagnamento.",
    lead: "Pagate solo sui biglietti a pagamento venduti. Nessun abbonamento, nessun costo di apertura, nessun vincolo.",
    perTicket: "per biglietto a pagamento venduto",
    recommended: "Con accompagnamento",
    free: {
      name: "Eventi gratuiti",
      price: "CHF 0",
      unit: "biglietti gratuiti e iscrizioni",
      lead: "Per ingressi liberi, iscrizioni e inviti.",
      items: ["Tutte le funzioni della biglietteria", "Controllo all'ingresso dal telefono", "Aiuto online, senza assistenza personale"],
    },
    selfService: {
      name: "Self-service",
      lead: "Configurate tutto da soli, al prezzo più basso.",
      items: [
        "Apriamo il vostro spazio, voi create i vostri eventi",
        "Tutte le funzioni: posti numerati, biglietti via e-mail, cassa, controllo all'ingresso",
        "Aiuto online, senza assistenza personale",
      ],
    },
    premium: {
      name: "Premium",
      lead: "Mettiamo in piedi tutto noi e restiamo al vostro fianco.",
      items: [
        "Configurazione fatta da noi: evento, tariffe, pianta della sala semplice",
        "Formazione del vostro team in videoconferenza",
        "Assistenza via e-mail e telefono nei giorni feriali",
        "Assistenza a distanza il giorno dell'evento",
      ],
    },
    full: {
      name: "Organizzazione completa",
      price: "Su preventivo",
      unit: "biglietteria Premium compresa",
      lead: "Ci affidate l'organizzazione del vostro evento.",
      items: ["Biglietteria, comunicazione e coordinamento, secondo le vostre esigenze", "Un solo interlocutore dall'inizio alla fine", "Preventivo dopo un primo colloquio"],
    },
    examplesTitle: "Che cosa significa per biglietto",
    examplesTicket: "Prezzo del biglietto",
    notesTitle: "Buono a sapersi",
    notes: [
      "Il ricavo delle vendite arriva direttamente sul vostro conto PostFinance o Stripe. Le commissioni di carta e TWINT sono quelle del vostro fornitore di pagamento: le regolate con lui.",
      "La commissione ticketick è fatturata dopo l'evento; per una stagione, ogni mese.",
      "Pianta della sala numerata complessa (balconate, più livelli): CHF {plan}, una tantum.",
      "Tutti i prezzi si intendono IVA esclusa.",
    ],
    ctaTitle: "Un evento in vista?",
    ctaLead: "Diteci che cosa organizzate: apriamo il vostro spazio e vi indichiamo la formula adatta.",
    cta: "Parlare del mio evento",
  },
} as const;

type Content = (typeof content)[keyof typeof content];

const paidPlans: PlatformPlan[] = ["selfService", "premium"];

function planPrice(plan: PlatformPlan, locale: string): string {
  const { fixedCents, bps } = PLATFORM_FEES[plan];
  return `CHF ${chf(fixedCents)} + ${percentLabel(bps, locale)}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const c = byLocale<Content>(content, locale);
  return { title: c.title, description: c.description, alternates: pageAlternates("/pricing", locale) };
}

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = byLocale<Content>(content, locale);
  // Sans traduction espagnole, la page s'affiche en anglais : les nombres suivent.
  const numberLocale = locale === "es" ? "en" : locale;

  const cards = [
    { key: "free", ...c.free, highlight: false },
    { key: "selfService", ...c.selfService, price: planPrice("selfService", numberLocale), unit: c.perTicket, highlight: false },
    { key: "premium", ...c.premium, price: planPrice("premium", numberLocale), unit: c.perTicket, highlight: true },
    { key: "full", ...c.full, highlight: false },
  ];

  return (
    <div className="container-page py-12">
      <div className="max-w-2xl">
        <span className="inline-flex items-center rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium">
          {c.badge}
        </span>
        <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">{c.title}</h1>
        <p className="mt-4 text-lg text-muted-foreground">{c.lead}</p>
      </div>

      <ul className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <li
            key={card.key}
            className={`flex flex-col rounded-card border bg-card p-6 ${
              card.highlight ? "border-primary shadow-sm" : "border-border"
            }`}
          >
            {card.highlight ? (
              <span className="mb-3 self-start rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                {c.recommended}
              </span>
            ) : null}
            <h2 className="text-lg font-semibold">{card.name}</h2>
            <p className="mt-3 text-2xl font-bold tracking-tight">{card.price}</p>
            <p className="text-sm text-muted-foreground">{card.unit}</p>
            <p className="mt-4 text-sm">{card.lead}</p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              {card.items.map((item) => (
                <li key={item} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <section className="mt-14 max-w-2xl" aria-labelledby="pricing-examples">
        <h2 id="pricing-examples" className="text-2xl font-bold tracking-tight">
          {c.examplesTitle}
        </h2>
        <div className="mt-6 overflow-x-auto rounded-card border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th scope="col" className="px-5 py-3 font-semibold">{c.examplesTicket}</th>
                <th scope="col" className="px-5 py-3 font-semibold">{c.selfService.name}</th>
                <th scope="col" className="px-5 py-3 font-semibold">{c.premium.name}</th>
              </tr>
            </thead>
            <tbody>
              {EXAMPLE_TICKET_PRICES_CENTS.map((price) => (
                <tr key={price} className="border-b border-border last:border-0">
                  <th scope="row" className="px-5 py-3 text-left font-medium">CHF {chf(price)}</th>
                  {paidPlans.map((plan) => (
                    <td key={plan} className="px-5 py-3 tabular-nums">
                      CHF {chf(platformFeeCents(plan, price))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-14 max-w-2xl" aria-labelledby="pricing-notes">
        <h2 id="pricing-notes" className="text-2xl font-bold tracking-tight">
          {c.notesTitle}
        </h2>
        <ul className="mt-6 space-y-3 text-muted-foreground">
          {c.notes.map((note) => (
            <li key={note} className="flex gap-2">
              <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
              <span>{note.replace("{plan}", String(COMPLEX_SEATING_PLAN_CENTS / 100))}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-14 max-w-2xl rounded-card border border-border bg-card p-6 sm:p-8">
        <h2 className="text-2xl font-bold tracking-tight">{c.ctaTitle}</h2>
        <p className="mt-2 text-muted-foreground">{c.ctaLead}</p>
        <Link href="/organizer#contact" className="mt-6 inline-block">
          <Button size="lg" className="gap-2">
            {c.cta}
            <ArrowRight className="size-4" />
          </Button>
        </Link>
      </section>
    </div>
  );
}
