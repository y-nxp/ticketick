import type {
  Category,
  EventStatus,
  Organizer,
  TicketType,
  Translated,
  Venue,
} from "../src/lib/types";

/**
 * Jeu de données de démonstration, consommé uniquement par `prisma/seed.ts`.
 *
 * Volontairement « plat » : une seule date par événement. C'est le seed qui le
 * transforme en Event + EventSession. L'application, elle, lit la base.
 */
export interface EventFixture {
  id: string;
  slug: string;
  title: Translated;
  description: Translated;
  status: EventStatus;
  featured: boolean;
  coverImage: string;
  gallery: string[];
  startsAt: string;
  endsAt?: string;
  doorsAt?: string;
  venue: Venue;
  organizer: Organizer;
  categories: Category[];
  ticketTypes: TicketType[];
  hasMap: boolean;
}

export const categories: Category[] = [
  // Couleurs harmonisées avec le violet de marque, contraste suffisant pour du texte blanc.
  { id: "c-concert", slug: "concert", name: { fr: "Concert", en: "Concert", de: "Konzert", it: "Concerto" }, color: "#6c5ce7", icon: "Music" },
  { id: "c-theatre", slug: "theatre", name: { fr: "Théâtre", en: "Theatre", de: "Theater", it: "Teatro" }, color: "#9333ea", icon: "Drama" },
  { id: "c-festival", slug: "festival", name: { fr: "Festival", en: "Festival", de: "Festival", it: "Festival" }, color: "#d97706", icon: "Tent" },
  { id: "c-humour", slug: "humour", name: { fr: "Humour", en: "Comedy", de: "Comedy", it: "Comicità" }, color: "#0284c7", icon: "Laugh" },
  { id: "c-danse", slug: "danse", name: { fr: "Danse", en: "Dance", de: "Tanz", it: "Danza" }, color: "#c026d3", icon: "Sparkles" },
  { id: "c-classique", slug: "classique", name: { fr: "Classique", en: "Classical", de: "Klassik", it: "Classica" }, color: "#0f9d6e", icon: "Piano" },
  { id: "c-sport", slug: "sport", name: { fr: "Sport", en: "Sport", de: "Sport", it: "Sport" }, color: "#2563eb", icon: "Trophy" },
  { id: "c-expo", slug: "exposition", name: { fr: "Exposition", en: "Exhibition", de: "Ausstellung", it: "Mostra" }, color: "#ea580c", icon: "Image" },
];

const catById = Object.fromEntries(categories.map((c) => [c.slug, c]));

export const venues: Venue[] = [
  { id: "v-hallenstadion", name: "Hallenstadion", address: "Wallisellenstrasse 45", city: "Zürich", canton: "ZH", country: "CH", lat: 47.4114, lng: 8.5518 },
  { id: "v-arena-geneve", name: "Arena de Genève", address: "Route des Batailleux 5", city: "Genève", canton: "GE", country: "CH", lat: 46.2183, lng: 6.1035 },
  { id: "v-theatre-lausanne", name: "Théâtre de Beaulieu", address: "Av. des Bergières 10", city: "Lausanne", canton: "VD", country: "CH", lat: 46.5306, lng: 6.6161 },
  { id: "v-kkl", name: "KKL Luzern", address: "Europaplatz 1", city: "Luzern", canton: "LU", country: "CH", lat: 47.0502, lng: 8.3115 },
  { id: "v-stgeorgen", name: "Kaserne Basel", address: "Klybeckstrasse 1b", city: "Basel", canton: "BS", country: "CH", lat: 47.5686, lng: 7.5906 },
  { id: "v-montreux", name: "Montreux Jazz Lab", address: "Av. Claude-Nobs 5", city: "Montreux", canton: "VD", country: "CH", lat: 46.4312, lng: 6.9107 },
  { id: "v-bern", name: "Bierhübeli", address: "Neubrückstrasse 43", city: "Bern", canton: "BE", country: "CH", lat: 46.9564, lng: 7.4283 },
];

const venueById = Object.fromEntries(venues.map((v) => [v.id, v]));

export const organizers: Organizer[] = [
  { id: "o-live", slug: "live-nation-ch", name: "Live Nation Suisse", friendsAppEnabled: true },
  { id: "o-mjf", slug: "montreux-jazz", name: "Montreux Jazz Festival", friendsAppEnabled: true },
  { id: "o-theatre", slug: "scenes-romandes", name: "Scènes Romandes", friendsAppEnabled: false },
  { id: "o-comedy", slug: "swiss-comedy", name: "Swiss Comedy Club", friendsAppEnabled: false },
];

const orgById = Object.fromEntries(organizers.map((o) => [o.id, o]));

function img(id: string) {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=80`;
}

const now = new Date("2026-08-21T12:00:00+02:00");
function daysFromNow(days: number, hour = 20) {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

let ttSeq = 0;
function tt(
  name: { fr: string; en: string; de: string; it: string },
  priceCents: number,
  quantity: number,
  sold = 0,
) {
  ttSeq += 1;
  return {
    id: `tt-${ttSeq}`,
    name,
    priceCents,
    currency: "CHF",
    quantity,
    sold,
    maxPerOrder: 10,
  };
}

const cats = {
  concert: catById.concert,
  theatre: catById.theatre,
  festival: catById.festival,
  humour: catById.humour,
  danse: catById.danse,
  classique: catById.classique,
  sport: catById.sport,
  expo: catById.exposition,
};

export const events: EventFixture[] = [
  {
    id: "e-1",
    slug: "stephan-eicher-hallenstadion",
    title: { fr: "Stephan Eicher — Live", en: "Stephan Eicher — Live", de: "Stephan Eicher — Live", it: "Stephan Eicher — Live" },
    description: {
      fr: "L'icône de la chanson suisse revient sur scène pour une tournée exceptionnelle mêlant ses plus grands succès et de nouvelles compositions.",
      en: "The Swiss songwriting icon returns to the stage for an exceptional tour blending his greatest hits with new compositions.",
      de: "Die Ikone des Schweizer Chansons kehrt für eine aussergewöhnliche Tournee auf die Bühne zurück.",
      it: "L'icona della canzone svizzera torna sul palco per una tournée eccezionale.",
    },
    status: "PUBLISHED",
    featured: true,
    coverImage: img("photo-1470229722913-7c0e2dbbafd3"),
    gallery: [],
    startsAt: daysFromNow(12),
    doorsAt: daysFromNow(12, 18),
    venue: venueById["v-hallenstadion"],
    organizer: orgById["o-live"],
    categories: [cats.concert],
    ticketTypes: [
      tt({ fr: "Fosse debout", en: "Standing", de: "Stehplatz", it: "In piedi" }, 8900, 2000, 1200),
      tt({ fr: "Gradins", en: "Seated", de: "Sitzplatz", it: "Posto a sedere" }, 11900, 1500, 400),
      tt({ fr: "Carré Or", en: "Golden Circle", de: "Golden Circle", it: "Golden Circle" }, 18900, 200, 190),
    ],
    hasMap: true,
  },
  {
    id: "e-2",
    slug: "montreux-jazz-nuit-soul",
    title: { fr: "Montreux Jazz — Nuit Soul", en: "Montreux Jazz — Soul Night", de: "Montreux Jazz — Soul Nacht", it: "Montreux Jazz — Notte Soul" },
    description: {
      fr: "Une nuit électrique au bord du Léman avec une programmation soul et funk d'exception.",
      en: "An electric night by Lake Geneva with an exceptional soul and funk lineup.",
      de: "Eine elektrische Nacht am Genfersee mit einem aussergewöhnlichen Soul- und Funk-Lineup.",
      it: "Una notte elettrica sul Lemano con un'eccezionale programmazione soul e funk.",
    },
    status: "PUBLISHED",
    featured: true,
    coverImage: img("photo-1493225457124-a3eb161ffa5f"),
    gallery: [],
    startsAt: daysFromNow(30),
    venue: venueById["v-montreux"],
    organizer: orgById["o-mjf"],
    categories: [cats.concert, cats.festival],
    ticketTypes: [
      tt({ fr: "Pass 1 jour", en: "1-day pass", de: "1-Tages-Pass", it: "Pass 1 giorno" }, 12500, 3000, 800),
      tt({ fr: "Pass VIP", en: "VIP pass", de: "VIP-Pass", it: "Pass VIP" }, 29000, 300, 120),
    ],
    hasMap: false,
  },
  {
    id: "e-3",
    slug: "le-malade-imaginaire-lausanne",
    title: { fr: "Le Malade imaginaire", en: "The Imaginary Invalid", de: "Der eingebildete Kranke", it: "Il malato immaginario" },
    description: {
      fr: "La célèbre comédie de Molière dans une mise en scène contemporaine et pleine d'esprit.",
      en: "Molière's famous comedy in a witty, contemporary staging.",
      de: "Molières berühmte Komödie in einer geistreichen, zeitgenössischen Inszenierung.",
      it: "La celebre commedia di Molière in una messa in scena contemporanea e spiritosa.",
    },
    status: "PUBLISHED",
    featured: false,
    coverImage: img("photo-1503095396549-807759245b35"),
    gallery: [],
    startsAt: daysFromNow(5, 19),
    venue: venueById["v-theatre-lausanne"],
    organizer: orgById["o-theatre"],
    categories: [cats.theatre],
    ticketTypes: [
      tt({ fr: "Plein tarif", en: "Full price", de: "Normalpreis", it: "Prezzo intero" }, 5500, 600, 210),
      tt({ fr: "Réduit", en: "Reduced", de: "Ermässigt", it: "Ridotto" }, 3500, 300, 150),
    ],
    hasMap: true,
  },
  {
    id: "e-4",
    slug: "orchestre-symphonique-kkl",
    title: { fr: "Orchestre Symphonique — Beethoven", en: "Symphony Orchestra — Beethoven", de: "Sinfonieorchester — Beethoven", it: "Orchestra Sinfonica — Beethoven" },
    description: {
      fr: "Les 5e et 7e symphonies de Beethoven dans l'acoustique légendaire du KKL.",
      en: "Beethoven's 5th and 7th symphonies in the legendary acoustics of the KKL.",
      de: "Beethovens 5. und 7. Sinfonie in der legendären Akustik des KKL.",
      it: "La 5ª e la 7ª sinfonia di Beethoven nell'acustica leggendaria del KKL.",
    },
    status: "PUBLISHED",
    featured: true,
    coverImage: img("photo-1465847899084-d164df4dedc6"),
    gallery: [],
    startsAt: daysFromNow(18, 19),
    venue: venueById["v-kkl"],
    organizer: orgById["o-theatre"],
    categories: [cats.classique],
    ticketTypes: [
      tt({ fr: "Catégorie 1", en: "Category 1", de: "Kategorie 1", it: "Categoria 1" }, 14000, 400, 300),
      tt({ fr: "Catégorie 2", en: "Category 2", de: "Kategorie 2", it: "Categoria 2" }, 9000, 500, 250),
      tt({ fr: "Catégorie 3", en: "Category 3", de: "Kategorie 3", it: "Categoria 3" }, 5000, 400, 100),
    ],
    hasMap: true,
  },
  {
    id: "e-5",
    slug: "soiree-stand-up-geneve",
    title: { fr: "Soirée Stand-Up", en: "Stand-Up Night", de: "Stand-Up Abend", it: "Serata Stand-Up" },
    description: {
      fr: "Les meilleurs humoristes de Suisse romande sur une seule scène.",
      en: "The best comedians of French-speaking Switzerland on one stage.",
      de: "Die besten Comedians der Westschweiz auf einer Bühne.",
      it: "I migliori comici della Svizzera romanda su un unico palco.",
    },
    status: "PUBLISHED",
    featured: false,
    coverImage: img("photo-1585699324551-f6c309eedeca"),
    gallery: [],
    startsAt: daysFromNow(8, 20),
    venue: venueById["v-arena-geneve"],
    organizer: orgById["o-comedy"],
    categories: [cats.humour],
    ticketTypes: [
      tt({ fr: "Entrée", en: "Admission", de: "Eintritt", it: "Ingresso" }, 4500, 800, 640),
    ],
    hasMap: false,
  },
  {
    id: "e-6",
    slug: "electro-open-air-basel",
    title: { fr: "Electro Open Air", en: "Electro Open Air", de: "Electro Open Air", it: "Electro Open Air" },
    description: {
      fr: "Un line-up électro international dans un cadre industriel unique à Bâle.",
      en: "An international electro line-up in a unique industrial setting in Basel.",
      de: "Ein internationales Electro-Line-up in einem einzigartigen industriellen Ambiente in Basel.",
      it: "Un line-up electro internazionale in un contesto industriale unico a Basilea.",
    },
    status: "PUBLISHED",
    featured: false,
    coverImage: img("photo-1516450360452-9312f5e86fc7"),
    gallery: [],
    startsAt: daysFromNow(45, 22),
    venue: venueById["v-stgeorgen"],
    organizer: orgById["o-live"],
    categories: [cats.festival, cats.concert],
    ticketTypes: [
      tt({ fr: "Early Bird", en: "Early Bird", de: "Early Bird", it: "Early Bird" }, 6900, 500, 500),
      tt({ fr: "Regular", en: "Regular", de: "Regular", it: "Regular" }, 8900, 1500, 300),
    ],
    hasMap: false,
  },
  {
    id: "e-7",
    slug: "casse-noisette-bern",
    title: { fr: "Casse-Noisette — Ballet", en: "The Nutcracker — Ballet", de: "Der Nussknacker — Ballett", it: "Lo Schiaccianoci — Balletto" },
    description: {
      fr: "Le ballet féerique de Tchaïkovski, un enchantement pour toute la famille.",
      en: "Tchaikovsky's magical ballet, a delight for the whole family.",
      de: "Tschaikowskis zauberhaftes Ballett, ein Vergnügen für die ganze Familie.",
      it: "Il magico balletto di Čajkovskij, un incanto per tutta la famiglia.",
    },
    status: "PUBLISHED",
    featured: false,
    coverImage: img("photo-1518834107812-67b0b7c58434"),
    gallery: [],
    startsAt: daysFromNow(60, 15),
    venue: venueById["v-bern"],
    organizer: orgById["o-theatre"],
    categories: [cats.danse, cats.classique],
    ticketTypes: [
      tt({ fr: "Adulte", en: "Adult", de: "Erwachsene", it: "Adulto" }, 7500, 700, 200),
      tt({ fr: "Enfant", en: "Child", de: "Kind", it: "Bambino" }, 4000, 300, 120),
    ],
    hasMap: true,
  },
  {
    id: "e-8",
    slug: "indie-rock-night-zurich",
    title: { fr: "Indie Rock Night", en: "Indie Rock Night", de: "Indie Rock Night", it: "Indie Rock Night" },
    description: {
      fr: "Trois groupes indépendants montants pour une soirée rock inoubliable.",
      en: "Three rising independent bands for an unforgettable rock night.",
      de: "Drei aufstrebende Indie-Bands für eine unvergessliche Rock-Nacht.",
      it: "Tre band indipendenti emergenti per una serata rock indimenticabile.",
    },
    status: "PUBLISHED",
    featured: false,
    coverImage: img("photo-1459749411175-04bf5292ceea"),
    gallery: [],
    startsAt: daysFromNow(2, 21),
    venue: venueById["v-hallenstadion"],
    organizer: orgById["o-live"],
    categories: [cats.concert],
    ticketTypes: [
      tt({ fr: "Debout", en: "Standing", de: "Stehplatz", it: "In piedi" }, 5900, 1200, 1200),
    ],
    hasMap: false,
  },
];
