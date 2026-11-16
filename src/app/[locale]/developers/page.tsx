import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Bot, Braces, KeyRound, Search, ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { OPERATIONS } from "@/lib/api/operations";
import { publicAppOrigin } from "@/lib/app-url";
import { byLocale } from "@/lib/i18n-fallback";
import { jsonLdScript } from "@/lib/seo/event";
import { pageAlternates } from "@/lib/seo/site";

const content = {
  fr: {
    title: "API et agents IA",
    subtitle:
      "Laissez votre agent IA créer vos spectacles, séances et tarifs sur ticketick, ou interrogez notre catalogue de concerts et festivals en Suisse.",
    cards: [
      { t: "Serveur MCP", d: "Branchez Claude, ChatGPT, Cursor ou tout agent compatible MCP : il crée et publie vos événements en langage naturel." },
      { t: "API REST", d: "JSON, clé par organisateur, spécification OpenAPI 3.1. Les mêmes opérations que le serveur MCP." },
      { t: "Catalogue public", d: "Recherche des spectacles en vente, sans clé : dates, lieux, prix, places et liens de réservation." },
    ],
    stepsTitle: "Démarrer en trois étapes",
    steps: [
      "Dans l'admin ticketick, page « API & agents IA », créez une clé. Cochez « Peut publier » seulement si l'agent doit mettre en ligne lui-même.",
      "Ajoutez le serveur MCP à votre agent avec la clé dans l'en-tête Authorization.",
      "Demandez-lui par exemple : « Crée le concert de Noël le 5 décembre à 20 h au Temple de Rougemont, 300 places, 45 CHF plein tarif et 20 CHF étudiant. »",
    ],
    rulesTitle: "Les règles",
    rules: [
      "Un événement créé par un agent est un brouillon, que vous relisez avant de publier, sauf si la clé a le droit de publier.",
      "Une clé n'agit que pour son organisateur. Vous la révoquez à tout moment.",
      "Rien de ce qui a vendu des billets ne peut être supprimé par l'API, et une séance vendue garde sa date et son lieu.",
      "Heures en heure suisse, prix en francs suisses, textes en français, anglais, allemand et italien.",
    ],
    toolsTitle: "Outils disponibles",
    noKey: "sans clé",
    linksTitle: "Pour les développeurs et les modèles",
    ctaOrganizer: "Créer une clé",
    ctaNew: "Vendre avec ticketick",
  },
  en: {
    title: "API and AI agents",
    subtitle:
      "Let your AI agent create your events, sessions and ticket types on ticketick, or query our catalogue of concerts and festivals in Switzerland.",
    cards: [
      { t: "MCP server", d: "Connect Claude, ChatGPT, Cursor or any MCP-compatible agent: it creates and publishes your events in plain language." },
      { t: "REST API", d: "JSON, one key per organizer, OpenAPI 3.1 specification. The same operations as the MCP server." },
      { t: "Public catalogue", d: "Search events on sale, no key needed: dates, venues, prices, availability and booking links." },
    ],
    stepsTitle: "Get started in three steps",
    steps: [
      "In the ticketick admin, page “API & AI agents”, create a key. Tick “Can publish” only if the agent should put events online itself.",
      "Add the MCP server to your agent with the key in the Authorization header.",
      "Ask, for instance: “Create the Christmas concert on 5 December at 8 pm at the Temple in Rougemont, 300 seats, CHF 45 full price and CHF 20 students.”",
    ],
    rulesTitle: "Rules",
    rules: [
      "An event created by an agent is a draft that you review before publishing, unless the key may publish.",
      "A key acts only for its organizer. You can revoke it at any time.",
      "Nothing that has sold tickets can be deleted through the API, and a session with sales keeps its date and venue.",
      "Swiss local time, prices in Swiss francs, texts in French, English, German and Italian.",
    ],
    toolsTitle: "Available tools",
    noKey: "no key",
    linksTitle: "For developers and language models",
    ctaOrganizer: "Create a key",
    ctaNew: "Sell with ticketick",
  },
  de: {
    title: "API und KI-Agenten",
    subtitle:
      "Lassen Sie Ihren KI-Agenten Veranstaltungen, Vorstellungen und Tarife auf ticketick anlegen, oder durchsuchen Sie unseren Katalog von Konzerten und Festivals in der Schweiz.",
    cards: [
      { t: "MCP-Server", d: "Verbinden Sie Claude, ChatGPT, Cursor oder jeden MCP-fähigen Agenten: Er legt Ihre Veranstaltungen in natürlicher Sprache an und veröffentlicht sie." },
      { t: "REST-API", d: "JSON, ein Schlüssel pro Veranstalter, OpenAPI-3.1-Spezifikation. Dieselben Operationen wie der MCP-Server." },
      { t: "Öffentlicher Katalog", d: "Suche nach Veranstaltungen im Verkauf, ohne Schlüssel: Daten, Orte, Preise, Verfügbarkeit und Buchungslinks." },
    ],
    stepsTitle: "In drei Schritten starten",
    steps: [
      "Erstellen Sie im ticketick-Admin, Seite «API & KI-Agenten», einen Schlüssel. Aktivieren Sie «Darf veröffentlichen» nur, wenn der Agent selbst veröffentlichen soll.",
      "Fügen Sie den MCP-Server mit dem Schlüssel im Authorization-Header zu Ihrem Agenten hinzu.",
      "Bitten Sie ihn zum Beispiel: «Lege das Weihnachtskonzert am 5. Dezember um 20 Uhr im Temple in Rougemont an, 300 Plätze, CHF 45 Vollpreis und CHF 20 für Studierende.»",
    ],
    rulesTitle: "Regeln",
    rules: [
      "Eine vom Agenten angelegte Veranstaltung ist ein Entwurf, den Sie vor der Veröffentlichung prüfen, ausser der Schlüssel darf veröffentlichen.",
      "Ein Schlüssel handelt nur für seinen Veranstalter. Sie können ihn jederzeit widerrufen.",
      "Nichts mit verkauften Tickets kann über die API gelöscht werden, und eine Vorstellung mit Verkäufen behält Datum und Ort.",
      "Schweizer Ortszeit, Preise in Franken, Texte auf Französisch, Englisch, Deutsch und Italienisch.",
    ],
    toolsTitle: "Verfügbare Werkzeuge",
    noKey: "ohne Schlüssel",
    linksTitle: "Für Entwickler und Sprachmodelle",
    ctaOrganizer: "Schlüssel erstellen",
    ctaNew: "Mit ticketick verkaufen",
  },
  it: {
    title: "API e agenti IA",
    subtitle:
      "Lascia che il tuo agente IA crei spettacoli, rappresentazioni e tariffe su ticketick, oppure interroga il nostro catalogo di concerti e festival in Svizzera.",
    cards: [
      { t: "Server MCP", d: "Collega Claude, ChatGPT, Cursor o qualsiasi agente compatibile MCP: crea e pubblica i tuoi eventi in linguaggio naturale." },
      { t: "API REST", d: "JSON, una chiave per organizzatore, specifica OpenAPI 3.1. Le stesse operazioni del server MCP." },
      { t: "Catalogo pubblico", d: "Ricerca degli spettacoli in vendita, senza chiave: date, luoghi, prezzi, disponibilità e link di prenotazione." },
    ],
    stepsTitle: "Inizia in tre passi",
    steps: [
      "Nell'admin di ticketick, pagina «API & agenti IA», crea una chiave. Seleziona «Può pubblicare» solo se l'agente deve mettere online da sé.",
      "Aggiungi il server MCP al tuo agente con la chiave nell'intestazione Authorization.",
      "Chiedigli per esempio: «Crea il concerto di Natale il 5 dicembre alle 20 al Temple di Rougemont, 300 posti, CHF 45 intero e CHF 20 studenti.»",
    ],
    rulesTitle: "Le regole",
    rules: [
      "Un evento creato da un agente è una bozza da rileggere prima di pubblicare, a meno che la chiave possa pubblicare.",
      "Una chiave agisce solo per il suo organizzatore. Puoi revocarla in qualsiasi momento.",
      "Nulla che abbia venduto biglietti può essere eliminato tramite l'API, e una rappresentazione con vendite mantiene data e luogo.",
      "Ora svizzera, prezzi in franchi svizzeri, testi in francese, inglese, tedesco e italiano.",
    ],
    toolsTitle: "Strumenti disponibili",
    noKey: "senza chiave",
    linksTitle: "Per sviluppatori e modelli linguistici",
    ctaOrganizer: "Crea una chiave",
    ctaNew: "Vendi con ticketick",
  },
} as const;

type Content = (typeof content)[keyof typeof content];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const c = byLocale<Content>(content, locale);
  return {
    title: c.title,
    description: c.subtitle,
    alternates: pageAlternates("/developers", locale),
  };
}

const cardIcons = [Bot, Braces, Search];

export default async function DevelopersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = byLocale<Content>(content, locale);
  const origin = publicAppOrigin();
  const mcpUrl = `${origin}/api/mcp`;

  const config = JSON.stringify(
    { mcpServers: { ticketick: { type: "http", url: mcpUrl, headers: { Authorization: "Bearer tt_…" } } } },
    null,
    2,
  );
  const links = [
    { href: `${origin}/api/v1/openapi.json`, label: "OpenAPI 3.1 — /api/v1/openapi.json" },
    { href: `${origin}/llms.txt`, label: "llms.txt" },
    { href: `${origin}/llms-full.txt`, label: "llms-full.txt" },
    { href: `${origin}/api/v1/public/events`, label: "GET /api/v1/public/events" },
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebAPI",
    name: "ticketick API",
    description: content.en.subtitle,
    documentation: `${origin}/developers`,
    url: `${origin}/api/v1`,
    termsOfService: `${origin}/terms`,
    provider: { "@type": "Organization", name: "ticketick", url: origin },
  };

  return (
    <div className="container-page py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <div className="mx-auto max-w-3xl">
        <h1 className="text-4xl font-bold tracking-tight">{c.title}</h1>
        <p className="mt-4 text-lg text-muted-foreground">{c.subtitle}</p>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {c.cards.map((card, i) => {
            const Icon = cardIcons[i];
            return (
              <div key={card.t} className="rounded-card border border-border bg-card p-5">
                <Icon className="size-6 text-primary" />
                <h2 className="mt-3 font-semibold">{card.t}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{card.d}</p>
              </div>
            );
          })}
        </div>

        <section className="mt-12">
          <h2 className="flex items-center gap-2 text-2xl font-semibold">
            <KeyRound className="size-6 text-primary" />
            {c.stepsTitle}
          </h2>
          <ol className="mt-4 space-y-3">
            {c.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {i + 1}
                </span>
                <span className="pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-sm font-medium">MCP</p>
          <pre className="mt-1.5 overflow-x-auto rounded-control bg-secondary p-3 text-xs leading-relaxed">{mcpUrl}</pre>
          <pre className="mt-2 overflow-x-auto rounded-control bg-secondary p-3 text-xs leading-relaxed">
            {`claude mcp add --transport http ticketick ${mcpUrl} \\\n  --header "Authorization: Bearer tt_…"`}
          </pre>
          <pre className="mt-2 overflow-x-auto rounded-control bg-secondary p-3 text-xs leading-relaxed">{config}</pre>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/admin/api" className={buttonVariants({ size: "lg" })}>
              {c.ctaOrganizer}
            </Link>
            <Link href="/organizer" className={buttonVariants({ size: "lg", variant: "outline" })}>
              {c.ctaNew}
            </Link>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="flex items-center gap-2 text-2xl font-semibold">
            <ShieldCheck className="size-6 text-primary" />
            {c.rulesTitle}
          </h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-muted-foreground">
            {c.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold">{c.toolsTitle}</h2>
          <div className="mt-4 divide-y divide-border rounded-card border border-border">
            {OPERATIONS.map((op) => (
              <div key={op.name} className="p-4">
                <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <code className="font-mono text-sm font-semibold">{op.name}</code>
                  <span className="font-mono text-xs text-muted-foreground">
                    {op.method} /api/v1{op.path}
                  </span>
                  {op.auth === "public" ? (
                    <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      {c.noKey}
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{op.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold">{c.linksTitle}</h2>
          <ul className="mt-4 space-y-2">
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="font-mono text-sm text-primary hover:underline">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
