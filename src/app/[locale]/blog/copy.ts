import { byLocale } from "@/lib/i18n-fallback";

/**
 * Textes de la rubrique (comme `/pricing` : dictionnaire dans le code, hors
 * `messages/*.json`). L'espagnol retombe sur l'anglais (`byLocale`).
 * `{date}` est remplacé par la date formatée.
 */
const content = {
  fr: {
    badge: "Blog",
    title: "Guides pour vendre vos billets",
    description:
      "Guides pratiques pour les organisateurs en Suisse : billetterie en ligne, TWINT, contrôle d'entrée par QR code, frais, plan de salle et protection des données.",
    lead: "Billetterie en ligne, paiement, contrôle d'entrée : des guides pratiques pour les associations, communes, théâtres et festivals de Suisse.",
    fallbackNotice: null as string | null,
    otherLanguage: "Artikel auf Deutsch",
    read: "Lire l'article",
    published: "Publié le {date}",
    updated: "Mis à jour le {date}",
    faqTitle: "Questions fréquentes",
    allArticles: "Tous les articles",
    empty: "Aucun article publié pour l'instant.",
    ctaTitle: "Un événement en vue ?",
    ctaLead: "Dites-nous ce que vous organisez : nous ouvrons votre espace et vous indiquons la formule qui convient.",
    cta: "Parler de mon événement",
    pricing: "Voir les tarifs",
    unavailableTitle: "Articles momentanément indisponibles",
    unavailableBody: "Nous n'arrivons pas à charger les articles pour le moment. Réessayez dans quelques minutes.",
    retry: "Réessayer",
    home: "Retour à l'accueil",
  },
  en: {
    badge: "Blog",
    title: "Guides to selling your tickets",
    description:
      "Practical guides for event organisers in Switzerland: online ticketing, TWINT, QR code entrance control, fees, seating plans and data protection.",
    lead: "Online ticketing, payment, entrance control: practical guides for Swiss associations, municipalities, theatres and festivals.",
    fallbackNotice:
      "Our articles are written in French and German. The French articles are listed below.",
    otherLanguage: "Articles in German",
    read: "Read the article (French)",
    published: "Published on {date}",
    updated: "Updated on {date}",
    faqTitle: "Frequently asked questions",
    allArticles: "All articles",
    empty: "No articles published yet.",
    ctaTitle: "An event coming up?",
    ctaLead: "Tell us what you are organising: we open your space and point you to the plan that fits.",
    cta: "Talk about my event",
    pricing: "See pricing",
    unavailableTitle: "Articles temporarily unavailable",
    unavailableBody: "We cannot load the articles right now. Please try again in a few minutes.",
    retry: "Try again",
    home: "Back to home",
  },
  de: {
    badge: "Blog",
    title: "Ratgeber für den Ticketverkauf",
    description:
      "Praxisratgeber für Veranstalter in der Schweiz: Online-Ticketing, TWINT, Einlasskontrolle mit QR-Code, Gebühren, Saalplan und Datenschutz.",
    lead: "Online-Ticketing, Zahlung, Einlasskontrolle: Praxisratgeber für Vereine, Gemeinden, Theater und Festivals in der Schweiz.",
    fallbackNotice: null as string | null,
    otherLanguage: "Articles en français",
    read: "Artikel lesen",
    published: "Veröffentlicht am {date}",
    updated: "Aktualisiert am {date}",
    faqTitle: "Häufige Fragen",
    allArticles: "Alle Artikel",
    empty: "Noch keine Artikel veröffentlicht.",
    ctaTitle: "Eine Veranstaltung in Sicht?",
    ctaLead: "Sagen Sie uns, was Sie organisieren: Wir eröffnen Ihren Bereich und nennen Ihnen das passende Angebot.",
    cta: "Über meine Veranstaltung sprechen",
    pricing: "Preise ansehen",
    unavailableTitle: "Artikel vorübergehend nicht verfügbar",
    unavailableBody: "Die Artikel können im Moment nicht geladen werden. Bitte versuchen Sie es in einigen Minuten erneut.",
    retry: "Erneut versuchen",
    home: "Zur Startseite",
  },
  it: {
    badge: "Blog",
    title: "Guide per vendere i vostri biglietti",
    description:
      "Guide pratiche per gli organizzatori in Svizzera: biglietteria online, TWINT, controllo all'ingresso con codice QR, commissioni, pianta della sala e protezione dei dati.",
    lead: "Biglietteria online, pagamento, controllo all'ingresso: guide pratiche per associazioni, comuni, teatri e festival in Svizzera.",
    fallbackNotice:
      "I nostri articoli sono scritti in francese e in tedesco. Qui sotto trovate gli articoli in francese.",
    otherLanguage: "Articoli in tedesco",
    read: "Leggere l'articolo (in francese)",
    published: "Pubblicato il {date}",
    updated: "Aggiornato il {date}",
    faqTitle: "Domande frequenti",
    allArticles: "Tutti gli articoli",
    empty: "Nessun articolo pubblicato per ora.",
    ctaTitle: "Un evento in vista?",
    ctaLead: "Diteci che cosa organizzate: apriamo il vostro spazio e vi indichiamo la formula adatta.",
    cta: "Parlare del mio evento",
    pricing: "Vedere le tariffe",
    unavailableTitle: "Articoli momentaneamente non disponibili",
    unavailableBody: "Non riusciamo a caricare gli articoli al momento. Riprovate tra qualche minuto.",
    retry: "Riprovare",
    home: "Torna alla home",
  },
};

export type BlogCopy = (typeof content)["fr"];

export function blogCopy(locale: string): BlogCopy {
  return byLocale<BlogCopy>(content, locale);
}
