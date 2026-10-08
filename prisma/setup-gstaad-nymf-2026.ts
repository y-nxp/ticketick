/**
 * Gstaad New Year Music Festival, 21e édition (26.12.2026 – 10.01.2027).
 *
 * Crée l'organisateur, son compte, les lieux, le plan numéroté de
 * Rougemont, les 23 concerts et le rabais multi-concerts.
 *
 * Idempotent et lancé à chaque déploiement : le catalogue n'est créé qu'une
 * fois, avec l'organisateur. Ensuite seuls le plan de Rougemont et les sièges
 * des séances sont tenus à jour ; les réglages faits dans l'admin (prix,
 * textes, publication, concerts supprimés) ne sont jamais écrasés.
 *
 * Les ajouts arrivés après coup (identité, programme détaillé, conférences)
 * sont des étapes `once` : jouées une fois par base, puis plus jamais.
 */

import { Prisma, PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  ROUGEMONT_PLAN_SLUG,
  SIDE_MARKS,
  rougemontLayout,
} from "../src/lib/seating/plans/rougemont";

const prisma = new PrismaClient();

const ORG_SLUG = "gstaad-new-year-music-festival";
const ORG_NAME = "Gstaad New Year Music Festival";
const ACCOUNT_EMAIL = "gstaadnymf@ticketick.ch";
const COVER = "/covers/gstaad-nymf-2026.jpg";
const LEGACY_COVER = "/covers/gstaad-nymf-2026.png";
const SITE = "https://gstaadnewyearmusicfestival.ch";

type Tr = { fr: string; en: string; de: string; it: string; es: string };
const same = (s: string): Tr => ({ fr: s, en: s, de: s, it: s, es: s });
const LANGS = ["fr", "en", "de", "it", "es"] as const;
type Lang = (typeof LANGS)[number];

type VenueKey = "ROUGEMONT" | "STJOSEPH" | "LANDHAUS" | "YACHTCLUB" | "HOTELROUGEMONT";

type VenueDef = {
  name: string;
  city: string;
  zip: string;
  canton: string;
  capacity: number;
  address?: string;
  lat?: number;
  lng?: number;
  /** Noms portés par les versions précédentes du catalogue. */
  formerNames?: string[];
};

/** Adresses définitives fournies par le festival ; coordonnées OpenStreetMap. */
const VENUES: Record<VenueKey, VenueDef> = {
  ROUGEMONT: {
    name: "Église de Rougemont (Église Saint-Nicolas)",
    city: "Rougemont",
    zip: "1659",
    canton: "VD",
    capacity: 276,
    address: "Route de Flendruz 1",
    lat: 46.4875854,
    lng: 7.2062456,
    formerNames: ["Église de Rougemont"],
  },
  STJOSEPH: {
    name: "Kirche St. Josef",
    city: "Gstaad",
    zip: "3780",
    canton: "BE",
    capacity: 200,
    address: "Rialtostrasse 12",
    lat: 46.4748649,
    lng: 7.2863011,
    formerNames: ["Kirche St. Joseph"],
  },
  LANDHAUS: {
    name: "Hôtel Landhaus Saanen",
    city: "Saanen",
    zip: "3792",
    canton: "BE",
    capacity: 300,
    address: "Dorfstrasse 74",
    lat: 46.4898071,
    lng: 7.2605411,
    formerNames: ["Hôtel Landhaus"],
  },
  YACHTCLUB: {
    name: "Gstaad Yacht Club",
    city: "Gstaad",
    zip: "3780",
    canton: "BE",
    capacity: 0,
    address: "Untergstaadstrasse 15",
    lat: 46.4776188,
    lng: 7.2841414,
  },
  HOTELROUGEMONT: {
    name: "Hôtel de Rougemont",
    city: "Rougemont",
    zip: "1659",
    canton: "VD",
    capacity: 0,
    address: "Chemin des Palettes 14",
    lat: 46.4882883,
    lng: 7.2024335,
  },
};
/** Nom de la première version du catalogue, corrigé d'après le calendrier officiel. */
const LEGACY_STJOSEPH = "Kirche St. Joseph";

/** « Lieu, ville » dans les textes, sans répéter la ville déjà dans le nom. */
function placeLine(name: string, city: string): string {
  return name.includes(city) ? name : `${name}, ${city}`;
}

/** Libellés de séance de la première version, remplacés par le genre. */
const SERIES = {
  young: { fr: "Jeunes talents", en: "Young talents", de: "Junge Talente", it: "Giovani talenti" },
  masters: { fr: "Maîtres", en: "Masters", de: "Meister", it: "Maestri" },
  broadway: { fr: "Broadway Musicals", en: "Broadway Musicals", de: "Broadway Musicals", it: "Broadway Musicals" },
};

type Pricing =
  | { kind: "categories"; premium: number; cat1: number; cat2: number; cat3: number }
  | { kind: "single"; price: number }
  | { kind: "free" };

interface Concert {
  date: string;
  time: string;
  artist: string;
  venue: Exclude<VenueKey, "YACHTCLUB" | "HOTELROUGEMONT">;
  pricing: Pricing;
  series?: keyof typeof SERIES;
}

const cat = (premium: number, cat1: number, cat2: number, cat3: number): Pricing => ({
  kind: "categories",
  premium,
  cat1,
  cat2,
  cat3,
});
const single = (price: number): Pricing => ({ kind: "single", price });

const CONCERTS: Concert[] = [
  { date: "2026-12-26", time: "19:00", artist: "Grigoryan / Antonyan", venue: "ROUGEMONT", pricing: cat(200, 130, 90, 50) },
  { date: "2026-12-27", time: "15:00", artist: "Ensemble Mare Nostrum", venue: "LANDHAUS", pricing: single(50) },
  { date: "2026-12-27", time: "19:00", artist: "Fuchs / Cemin", venue: "ROUGEMONT", pricing: cat(250, 200, 90, 50) },
  { date: "2026-12-28", time: "15:00", artist: "Berry / Pérot / Goimard", venue: "ROUGEMONT", pricing: single(30), series: "young" },
  { date: "2026-12-28", time: "19:00", artist: "Edris / Pati / Pordoy", venue: "ROUGEMONT", pricing: cat(250, 200, 90, 50) },
  { date: "2026-12-29", time: "15:00", artist: "Angioloni / Masson", venue: "LANDHAUS", pricing: single(50) },
  { date: "2026-12-29", time: "19:00", artist: "Grigolo", venue: "ROUGEMONT", pricing: cat(250, 200, 90, 50) },
  { date: "2026-12-30", time: "19:00", artist: "Spyres / Pordoy", venue: "ROUGEMONT", pricing: cat(250, 200, 90, 50) },
  { date: "2027-01-01", time: "18:30", artist: "Sirolli / Pikulski", venue: "ROUGEMONT", pricing: { kind: "free" }, series: "broadway" },
  { date: "2027-01-02", time: "19:00", artist: "Oropesa / Tézier / Praticò", venue: "ROUGEMONT", pricing: cat(250, 200, 90, 50) },
  { date: "2027-01-03", time: "15:00", artist: "Bernheim / Matheson", venue: "ROUGEMONT", pricing: cat(250, 200, 90, 50) },
  { date: "2027-01-03", time: "19:00", artist: "Mkhitaryan / Zhilikhovsky", venue: "ROUGEMONT", pricing: cat(180, 130, 90, 50) },
  { date: "2027-01-04", time: "15:00", artist: "Ryan-Dugelay", venue: "STJOSEPH", pricing: single(30) },
  { date: "2027-01-04", time: "18:30", artist: "Pagano", venue: "STJOSEPH", pricing: single(30) },
  { date: "2027-01-05", time: "15:00", artist: "Arderíus", venue: "STJOSEPH", pricing: single(30) },
  { date: "2027-01-05", time: "19:00", artist: "Amadi / Belkin", venue: "ROUGEMONT", pricing: single(50), series: "masters" },
  { date: "2027-01-06", time: "15:00", artist: "Chenaux", venue: "STJOSEPH", pricing: single(30) },
  { date: "2027-01-06", time: "19:00", artist: "Schmitt / Reyes", venue: "ROUGEMONT", pricing: cat(180, 130, 90, 50) },
  { date: "2027-01-07", time: "19:00", artist: "Earl Rose", venue: "STJOSEPH", pricing: single(50) },
  { date: "2027-01-08", time: "15:00", artist: "Trio Nebelmeer", venue: "ROUGEMONT", pricing: single(30), series: "young" },
  { date: "2027-01-08", time: "19:00", artist: "Jany McPherson Trio", venue: "ROUGEMONT", pricing: single(50) },
  { date: "2027-01-09", time: "15:00", artist: "Martina Meola", venue: "ROUGEMONT", pricing: single(30), series: "young" },
  { date: "2027-01-10", time: "15:00", artist: "Alexandros Kapelis", venue: "ROUGEMONT", pricing: single(50), series: "masters" },
];

const YOUTH_NAME: Tr = {
  fr: "Moins de 25 ans",
  en: "Under 25",
  de: "Unter 25 Jahren",
  it: "Under 25",
  es: "Menores de 25 años",
};
const OLD_YOUTH_NAME_FR = "Gratuité moins de 25 ans";
const ZONE_NAMES: Record<string, Tr> = {
  PREMIUM: same("Premium"),
  CAT1: { fr: "Catégorie 1", en: "Category 1", de: "Kategorie 1", it: "Categoria 1", es: "Categoría 1" },
  CAT2: { fr: "Catégorie 2", en: "Category 2", de: "Kategorie 2", it: "Categoria 2", es: "Categoría 2" },
  CAT3: { fr: "Catégorie 3", en: "Category 3", de: "Kategorie 3", it: "Categoria 3", es: "Categoría 3" },
};
const NUMBERED: Tr = { fr: "Place numérotée", en: "Numbered seat", de: "Nummerierter Platz", it: "Posto numerato", es: "Asiento numerado" };
const UNRESERVED: Tr = { fr: "Placement libre", en: "Unreserved seating", de: "Freie Platzwahl", it: "Posto libero", es: "Asiento libre" };
const FREE_BOOKING: Tr = {
  fr: "Réservation gratuite",
  en: "Free reservation",
  de: "Kostenlose Reservierung",
  it: "Prenotazione gratuita",
  es: "Reserva gratuita",
};

/** Texte de la première version, remplacé par le programme tant que l'admin n'y a pas touché. */
function genericDescription(venueName: string, city: string): Tr {
  const where = `${venueName}, ${city}`;
  return {
    fr: `Gstaad New Year Music Festival, 21e édition. ${where}. Programme détaillé sur gstaadnewyearmusicfestival.ch.`,
    en: `Gstaad New Year Music Festival, 21st edition. ${where}. Full programme on gstaadnewyearmusicfestival.ch.`,
    de: `Gstaad New Year Music Festival, 21. Ausgabe. ${where}. Detailliertes Programm auf gstaadnewyearmusicfestival.ch.`,
    it: `Gstaad New Year Music Festival, 21a edizione. ${where}. Programma dettagliato su gstaadnewyearmusicfestival.ch.`,
    es: `Gstaad New Year Music Festival, 21.ª edición. ${where}. Programa completo en gstaadnewyearmusicfestival.ch.`,
  };
}

function description(venue: VenueKey): Tr {
  const v = VENUES[venue];
  return genericDescription(v.name, v.city);
}

// ─────────────────────────────── Programme (calendrier officiel, 21e édition)

const GENRES = {
  belcanto: { fr: "Bel canto", en: "Bel canto", de: "Belcanto", it: "Belcanto", es: "Bel canto" },
  baroque: { fr: "Baroque", en: "Baroque", de: "Barock", it: "Barocco", es: "Barroco" },
  young: { fr: "Jeunes talents", en: "Young talents", de: "Junge Talente", it: "Giovani talenti", es: "Jóvenes talentos" },
  duos: { fr: "Grands duos", en: "Great duos", de: "Grosse Duos", it: "Grandi duetti", es: "Grandes dúos" },
  masters: { fr: "Maîtres", en: "Masters", de: "Meister", it: "Maestri", es: "Maestros" },
  broadway: same("Broadway Musicals"),
  literary: { fr: "Spectacle littéraire", en: "Literary performance", de: "Literarische Aufführung", it: "Spettacolo letterario", es: "Espectáculo literario" },
  jazz: same("Jazz Session"),
  talk: { fr: "Conférence", en: "Talk", de: "Vortrag", it: "Conferenza", es: "Conferencia" },
  pianoSeries: { fr: "Série piano", en: "Piano series", de: "Klavierreihe", it: "Serie pianoforte", es: "Serie piano" },
  celloSeries: { fr: "Série violoncelle", en: "Cello series", de: "Cello-Reihe", it: "Serie violoncello", es: "Serie violonchelo" },
} satisfies Record<string, Tr>;
type Genre = keyof typeof GENRES;

const ROLES = {
  soprano: { fr: "soprano", en: "soprano", de: "Sopran", it: "soprano", es: "soprano" },
  mezzo: { fr: "mezzo-soprano", en: "mezzo-soprano", de: "Mezzosopran", it: "mezzosoprano", es: "mezzosoprano" },
  tenor: { fr: "ténor", en: "tenor", de: "Tenor", it: "tenore", es: "tenor" },
  baritenor: { fr: "baryténor", en: "baritenor", de: "Baritenor", it: "baritenore", es: "baritenor" },
  baritone: { fr: "baryton", en: "baritone", de: "Bariton", it: "baritono", es: "barítono" },
  bass: { fr: "basse", en: "bass", de: "Bass", it: "basso", es: "bajo" },
  piano: { fr: "piano", en: "piano", de: "Klavier", it: "pianoforte", es: "piano" },
  guitar: { fr: "guitare", en: "guitar", de: "Gitarre", it: "chitarra", es: "guitarra" },
  cello: { fr: "violoncelle", en: "cello", de: "Violoncello", it: "violoncello", es: "violonchelo" },
  conductor: { fr: "direction", en: "conductor", de: "Leitung", it: "direzione", es: "dirección" },
  narrator: { fr: "récitant", en: "narrator", de: "Sprecher", it: "voce recitante", es: "narrador" },
  speaker: { fr: "conférencier", en: "speaker", de: "Referent", it: "relatore", es: "conferenciante" },
  speakerF: { fr: "conférencière", en: "speaker", de: "Referentin", it: "relatrice", es: "conferenciante" },
} satisfies Record<string, Tr>;
type Role = keyof typeof ROLES;

const NOTES = {
  bordeaux: {
    fr: "* Académie de l’Opéra de Bordeaux",
    en: "* Opéra de Bordeaux Academy",
    de: "* Akademie der Opéra de Bordeaux",
    it: "* Accademia dell’Opéra de Bordeaux",
    es: "* Academia de la Ópera de Burdeos",
  },
  reineElisabeth: {
    fr: "Lauréat du Concours Reine Elisabeth 2026, Bruxelles",
    en: "Laureate of the 2026 Queen Elisabeth Competition, Brussels",
    de: "Preisträger des Concours Reine Elisabeth 2026, Brüssel",
    it: "Premiato al Concorso Regina Elisabetta 2026, Bruxelles",
    es: "Premiado en el Concurso Reina Isabel 2026, Bruselas",
  },
  dunand: {
    fr: "Lauréate du Prix Robert Dunand 2026 de la Villars Music Academy",
    en: "Winner of the 2026 Robert Dunand Prize, Villars Music Academy",
    de: "Preisträgerin des Prix Robert Dunand 2026 der Villars Music Academy",
    it: "Vincitrice del Premio Robert Dunand 2026 della Villars Music Academy",
    es: "Ganadora del Premio Robert Dunand 2026 de la Villars Music Academy",
  },
  rotary: {
    fr: "Prix du Rotary Club 2026 décerné par la Verbier Festival Academy",
    en: "2026 Rotary Club Prize, awarded by the Verbier Festival Academy",
    de: "Rotary-Club-Preis 2026, verliehen von der Verbier Festival Academy",
    it: "Premio del Rotary Club 2026, conferito dalla Verbier Festival Academy",
    es: "Premio del Rotary Club 2026, otorgado por la Verbier Festival Academy",
  },
  freeConcert: {
    fr: "Concert gratuit, sur réservation.",
    en: "Free concert, booking required.",
    de: "Kostenloses Konzert, mit Reservierung.",
    it: "Concerto gratuito, su prenotazione.",
    es: "Concierto gratuito, con reserva.",
  },
  beethovenYear: {
    fr: "Ouverture de l’année Beethoven.",
    en: "Opening of the Beethoven year.",
    de: "Auftakt zum Beethoven-Jahr.",
    it: "Apertura dell’anno beethoveniano.",
    es: "Apertura del año Beethoven.",
  },
} satisfies Record<string, Tr>;
type Note = keyof typeof NOTES;

interface Programme {
  /** Titre complet ; les noms courts de la première version servaient de repère. */
  title: string;
  genre: Genre;
  work?: string;
  cast: { name: string; role?: Role }[];
  notes?: Note[];
}

const PROGRAMME: Record<string, Programme> = {
  "2026-12-26 Grigoryan / Antonyan": { title: "Juliana Grigoryan & Hasmik Antonyan", genre: "belcanto", work: "Incanto", cast: [{ name: "Juliana Grigoryan", role: "soprano" }, { name: "Hasmik Antonyan", role: "piano" }] },
  "2026-12-27 Ensemble Mare Nostrum": { title: "Niccolò Balducci, Alex Rosen & Ensemble Mare Nostrum", genre: "baroque", work: "Stradella, un génie, un rebelle, un fugitif…", cast: [{ name: "Niccolò Balducci", role: "soprano" }, { name: "Alex Rosen", role: "bass" }, { name: "Ensemble Mare Nostrum" }, { name: "Andrea De Carlo", role: "conductor" }] },
  "2026-12-27 Fuchs / Cemin": { title: "Julie Fuchs & Alphonse Cemin", genre: "belcanto", work: "Paris-Vienne", cast: [{ name: "Julie Fuchs", role: "soprano" }, { name: "Alphonse Cemin", role: "piano" }] },
  "2026-12-28 Berry / Pérot / Goimard": { title: "Winona Berry, Arthur Pérot & Magali Goimard", genre: "young", work: "Les voix du Sud", cast: [{ name: "Winona Berry*", role: "mezzo" }, { name: "Arthur Pérot*", role: "tenor" }, { name: "Magali Goimard", role: "piano" }], notes: ["bordeaux"] },
  "2026-12-28 Edris / Pati / Pordoy": { title: "Amina Edris, Pene Pati & Mathieu Pordoy", genre: "duos", work: "D’un monde à l’autre", cast: [{ name: "Amina Edris", role: "soprano" }, { name: "Pene Pati", role: "tenor" }, { name: "Mathieu Pordoy", role: "piano" }] },
  "2026-12-29 Angioloni / Masson": { title: "Marco Angioloni & Léa Masson", genre: "belcanto", work: "Dolce Vita", cast: [{ name: "Marco Angioloni", role: "tenor" }, { name: "Léa Masson", role: "guitar" }] },
  "2026-12-29 Grigolo": { title: "Vittorio Grigolo", genre: "belcanto", work: "Hommage à Sinatra", cast: [{ name: "Vittorio Grigolo", role: "tenor" }, { name: "Ensemble instrumental" }] },
  "2026-12-30 Spyres / Pordoy": { title: "Tara Stafford-Spyres, Michael Spyres & Mathieu Pordoy", genre: "duos", work: "The Gilded Age of Musicals", cast: [{ name: "Tara Stafford-Spyres", role: "soprano" }, { name: "Michael Spyres", role: "baritenor" }, { name: "Mathieu Pordoy", role: "piano" }] },
  "2027-01-01 Sirolli / Pikulski": { title: "Virginia Sirolli & Maciej Pikulski", genre: "broadway", cast: [{ name: "Virginia Sirolli", role: "soprano" }, { name: "Maciej Pikulski", role: "piano" }], notes: ["freeConcert"] },
  "2027-01-02 Oropesa / Tézier / Praticò": { title: "Lisette Oropesa, Ludovic Tézier & Alessandro Praticò", genre: "duos", work: "Sous son ombre", cast: [{ name: "Lisette Oropesa", role: "soprano" }, { name: "Ludovic Tézier", role: "baritone" }, { name: "Alessandro Praticò", role: "piano" }] },
  "2027-01-03 Bernheim / Matheson": { title: "Benjamin Bernheim & Carrie-Ann Matheson", genre: "belcanto", work: "Les nuits d’été en hiver", cast: [{ name: "Benjamin Bernheim", role: "tenor" }, { name: "Carrie-Ann Matheson", role: "piano" }] },
  "2027-01-03 Mkhitaryan / Zhilikhovsky": { title: "Kristina Mkhitaryan & Andrey Zhilikhovsky", genre: "duos", work: "Duos passion", cast: [{ name: "Kristina Mkhitaryan", role: "soprano" }, { name: "Andrey Zhilikhovsky", role: "baritone" }] },
  "2027-01-04 Ryan-Dugelay": { title: "Liam Ryan-Dugelay", genre: "young", cast: [{ name: "Liam Ryan-Dugelay", role: "piano" }] },
  "2027-01-04 Pagano": { title: "Ettore Pagano", genre: "young", cast: [{ name: "Ettore Pagano", role: "cello" }], notes: ["reineElisabeth"] },
  "2027-01-05 Arderíus": { title: "Eva Arderíus", genre: "young", work: "Beethoven, Liszt, Franck et Debussy", cast: [{ name: "Eva Arderíus", role: "cello" }], notes: ["dunand"] },
  "2027-01-05 Amadi / Belkin": { title: "Thierry Amadi & Maki Belkin", genre: "masters", work: "Sonates et variations de Beethoven", cast: [{ name: "Thierry Amadi", role: "cello" }, { name: "Maki Belkin", role: "piano" }] },
  "2027-01-06 Chenaux": { title: "Lyam Chenaux", genre: "young", cast: [{ name: "Lyam Chenaux", role: "cello" }], notes: ["rotary"] },
  "2027-01-06 Schmitt / Reyes": { title: "Éric-Emmanuel Schmitt & Eliane Reyes", genre: "literary", work: "Nos vies avec Mozart", cast: [{ name: "Éric-Emmanuel Schmitt", role: "narrator" }, { name: "Eliane Reyes", role: "piano" }] },
  "2027-01-07 Earl Rose": { title: "Earl Rose", genre: "jazz", work: "A Night at the Carlyle", cast: [{ name: "Earl Rose", role: "piano" }] },
  "2027-01-08 Trio Nebelmeer": { title: "Trio Nebelmeer", genre: "young", work: "À l’Archiduc", cast: [{ name: "Trio Nebelmeer" }] },
  "2027-01-08 Jany McPherson Trio": { title: "Jany McPherson Trio", genre: "jazz", work: "A Long Way", cast: [{ name: "Jany McPherson Trio" }] },
  "2027-01-09 Martina Meola": { title: "Martina Meola", genre: "young", cast: [{ name: "Martina Meola", role: "piano" }] },
  "2027-01-10 Alexandros Kapelis": { title: "Alexandros Kapelis", genre: "masters", work: "Beethoven Piano Sonatas", cast: [{ name: "Alexandros Kapelis", role: "piano" }] },
};

/** Entrée libre sur inscription auprès du festival, rien à vendre ici. */
const TALKS: (Programme & { date: string; time: string; slugName: string })[] = [
  { date: "2026-12-30", time: "11:30", slugName: "Nelson Monfort", title: "Nelson Monfort", genre: "talk", work: "Que la montagne est belle", cast: [{ name: "Nelson Monfort", role: "speaker" }] },
  { date: "2027-01-02", time: "12:00", slugName: "Michèle Larivière", title: "Michèle Larivière", genre: "talk", work: "Bicentenaire de la mort de Beethoven", cast: [{ name: "Michèle Larivière", role: "speakerF" }], notes: ["beethovenYear"] },
];

const QUOTES: Record<Lang, [string, string]> = {
  fr: ["« ", " »"],
  en: ["“", "”"],
  de: ["„", "“"],
  it: ["«", "»"],
  es: ["«", "»"],
};

const FOOTER: Record<Lang, (where: string) => string> = {
  fr: (w) => `Gstaad New Year Music Festival, 21e édition. ${w}.\nProgramme sous réserve de modifications.`,
  en: (w) => `Gstaad New Year Music Festival, 21st edition. ${w}.\nProgramme subject to change.`,
  de: (w) => `Gstaad New Year Music Festival, 21. Ausgabe. ${w}.\nProgrammänderungen vorbehalten.`,
  it: (w) => `Gstaad New Year Music Festival, 21a edizione. ${w}.\nProgramma soggetto a modifiche.`,
  es: (w) => `Gstaad New Year Music Festival, 21.ª edición. ${w}.\nPrograma sujeto a cambios.`,
};

function programmeDescription(p: Programme, venue: VenueKey): Tr {
  const v = VENUES[venue];
  const out = {} as Tr;
  for (const lang of LANGS) {
    const [open, close] = QUOTES[lang];
    const head = p.work
      ? `${GENRES[p.genre][lang]} — ${open}${p.work}${close}`
      : GENRES[p.genre][lang];
    const cast = p.cast
      .map((c) => (c.role ? `${c.name}, ${ROLES[c.role][lang]}` : c.name))
      .join("\n");
    const notes = (p.notes ?? []).map((n) => NOTES[n][lang]).join("\n");
    out[lang] = [head, cast, notes, FOOTER[lang](placeLine(v.name, v.city))]
      .filter(Boolean)
      .join("\n\n");
  }
  return out;
}

const ORGANIZER_DESCRIPTION: Tr = {
  fr: "Festival international de musique classique, 21e édition, du 26 décembre 2026 au 10 janvier 2027 à Gstaad, Rougemont et Saanen : bel canto, grands duos, jeunes talents, jazz et conférences.",
  en: "International classical music festival, 21st edition, from 26 December 2026 to 10 January 2027 in Gstaad, Rougemont and Saanen: bel canto, great duos, young talents, jazz and talks.",
  de: "Internationales Festival für klassische Musik, 21. Ausgabe, vom 26. Dezember 2026 bis 10. Januar 2027 in Gstaad, Rougemont und Saanen: Belcanto, grosse Duos, junge Talente, Jazz und Vorträge.",
  it: "Festival internazionale di musica classica, 21a edizione, dal 26 dicembre 2026 al 10 gennaio 2027 a Gstaad, Rougemont e Saanen: belcanto, grandi duetti, giovani talenti, jazz e conferenze.",
  es: "Festival internacional de música clásica, 21.ª edición, del 26 de diciembre de 2026 al 10 de enero de 2027 en Gstaad, Rougemont y Saanen: bel canto, grandes dúos, jóvenes talentos, jazz y conferencias.",
};

function concertSlug(c: { date: string; artist: string }): string {
  return `gnymf-${c.date}-${slugify(c.artist)}`;
}

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Heure d'hiver à Gstaad : UTC+1 sur toute la durée du festival. */
function zurich(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+01:00`);
}

interface TariffInput {
  name: Tr;
  priceCents: number;
  quantity: number;
  maxPerOrder: number;
  seatZones?: string[];
  youth?: boolean;
}

function tariffsFor(concert: Concert): TariffInput[] {
  const capacity = VENUES[concert.venue].capacity;
  const p = concert.pricing;
  if (p.kind === "free") {
    return [{ name: FREE_BOOKING, priceCents: 0, quantity: capacity, maxPerOrder: 6 }];
  }
  if (p.kind === "categories") {
    const counts = { PREMIUM: 0, CAT1: 0, CAT2: 0, CAT3: 0 } as Record<string, number>;
    for (const seat of rougemontLayout.seats) counts[seat.zone] += 1;
    const prices: Record<string, number> = {
      PREMIUM: p.premium,
      CAT1: p.cat1,
      CAT2: p.cat2,
      CAT3: p.cat3,
    };
    return [
      ...Object.keys(prices).map((zone) => ({
        name: ZONE_NAMES[zone],
        priceCents: prices[zone] * 100,
        quantity: counts[zone],
        maxPerOrder: 10,
        seatZones: [zone],
      })),
      {
        name: YOUTH_NAME,
        priceCents: 0,
        quantity: counts.CAT2 + counts.CAT3,
        maxPerOrder: 2,
        seatZones: ["CAT2", "CAT3"],
        youth: true,
      },
    ];
  }
  return [
    {
      name: concert.venue === "ROUGEMONT" ? NUMBERED : UNRESERVED,
      priceCents: p.price * 100,
      quantity: capacity,
      maxPerOrder: 10,
    },
    { name: YOUTH_NAME, priceCents: 0, quantity: capacity, maxPerOrder: 2, youth: true },
  ];
}

async function ensureAccount(organizerId: string) {
  const existing = await prisma.user.findUnique({
    where: { email: ACCOUNT_EMAIL },
    select: { id: true, role: true },
  });
  if (existing && existing.role !== "ORGANIZER" && existing.role !== "CUSTOMER") {
    console.log(`  ⚠ ${ACCOUNT_EMAIL} a le rôle ${existing.role} : compte laissé tel quel.`);
    return;
  }
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { role: "ORGANIZER", active: true },
        select: { id: true },
      })
    : await prisma.user.create({
        data: {
          email: ACCOUNT_EMAIL,
          name: ORG_NAME,
          role: "ORGANIZER",
          locale: "fr",
          emailVerifiedAt: new Date(),
          // Inconnu de tous : le premier accès passe par « mot de passe oublié ».
          passwordHash: await bcrypt.hash(randomBytes(24).toString("base64url"), 12),
        },
        select: { id: true },
      });
  const owner = await prisma.organizer.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (owner && owner.id !== organizerId) {
    console.log(`  ⚠ ${ACCOUNT_EMAIL} est déjà lié à un autre organisateur.`);
    return;
  }
  await prisma.organizer.update({ where: { id: organizerId }, data: { userId: user.id } });
  if (!existing) console.log(`  Compte ${ACCOUNT_EMAIL} créé : premier accès par « mot de passe oublié ».`);
}

async function findOrCreateVenue(tx: Prisma.TransactionClient, key: VenueKey) {
  const v = VENUES[key];
  const found = await tx.venue.findFirst({
    where: { name: { in: [v.name, ...(v.formerNames ?? [])] }, city: v.city },
    select: { id: true },
  });
  if (found) return found.id;
  const created = await tx.venue.create({
    data: {
      name: v.name,
      city: v.city,
      zip: v.zip,
      canton: v.canton,
      country: "CH",
      address: v.address,
      lat: v.lat,
      lng: v.lng,
    },
    select: { id: true },
  });
  return created.id;
}

async function createCatalog() {
  return prisma.$transaction(
    async (tx) => {
      const organizer = await tx.organizer.create({
        data: {
          slug: ORG_SLUG,
          name: ORG_NAME,
          email: ACCOUNT_EMAIL,
          website: SITE,
        },
        select: { id: true },
      });

      const venueIds = {
        ROUGEMONT: await findOrCreateVenue(tx, "ROUGEMONT"),
        STJOSEPH: await findOrCreateVenue(tx, "STJOSEPH"),
        LANDHAUS: await findOrCreateVenue(tx, "LANDHAUS"),
      };

      const plan = await tx.seatPlan.upsert({
        where: { slug: ROUGEMONT_PLAN_SLUG },
        create: {
          slug: ROUGEMONT_PLAN_SLUG,
          name: "Église de Rougemont — concert",
          venueId: venueIds.ROUGEMONT,
          layout: rougemontLayout as unknown as Prisma.InputJsonValue,
        },
        update: {},
        select: { id: true },
      });

      for (const concert of CONCERTS) {
        const seated = concert.venue === "ROUGEMONT";
        const programme = PROGRAMME[`${concert.date} ${concert.artist}`];
        const event = await tx.event.create({
          data: {
            slug: concertSlug(concert),
            title: same(programme?.title ?? concert.artist),
            description: programme
              ? programmeDescription(programme, concert.venue)
              : description(concert.venue),
            status: "DRAFT",
            visibility: "PUBLIC",
            coverImage: COVER,
            acceptCard: false,
            acceptIban: false,
            acceptPaypal: true,
            organizerId: organizer.id,
            sessions: {
              create: {
                startsAt: zurich(concert.date, concert.time),
                status: "PUBLISHED",
                venueId: venueIds[concert.venue],
                seatPlanId: seated ? plan.id : null,
                capacity: VENUES[concert.venue].capacity,
                label: programme ? GENRES[programme.genre] : undefined,
              },
            },
          },
          select: { sessions: { select: { id: true } } },
        });
        const sessionId = event.sessions[0].id;
        for (const t of tariffsFor(concert)) {
          await tx.ticketType.create({
            data: {
              sessionId,
              name: t.name,
              priceCents: t.priceCents,
              currency: "CHF",
              quantity: t.quantity,
              maxPerOrder: t.maxPerOrder,
              seatZones: t.seatZones ?? [],
              ...(t.youth
                ? { maxPerPaidTicket: 2, requiresAttendee: true, maxAgeYears: 25 }
                : {}),
            },
          });
        }
      }

      await tx.discount.create({
        data: {
          label: {
            fr: "Rabais multi-concerts −15 %",
            en: "Multi-concert discount −15%",
            de: "Mehrkonzert-Rabatt −15 %",
            it: "Sconto multi-concerto −15%",
          },
          type: "PERCENTAGE",
          value: 1500,
          scope: "ORDER",
          organizerId: organizer.id,
          venueId: venueIds.ROUGEMONT,
          minDistinctSessions: 3,
        },
      });

      return organizer.id;
    },
    { timeout: 60_000 },
  );
}

/** Dernière version du plan dessiné ici ; ensuite, il se modifie dans l'admin. */
async function applyRougemontLayout() {
  const { count } = await prisma.seatPlan.updateMany({
    where: { slug: ROUGEMONT_PLAN_SLUG },
    data: { layout: rougemontLayout as unknown as Prisma.InputJsonValue },
  });
  return `Plan Rougemont : ${count ? "version du script appliquée" : "absent"}.`;
}

/**
 * Libellés « Scène gauche / droite » et numéros de rang, ajoutés au plan tel
 * qu'il est en base sans toucher aux retouches faites dans l'admin.
 */
async function labelRougemontPlan() {
  const plan = await prisma.seatPlan.findUnique({
    where: { slug: ROUGEMONT_PLAN_SLUG },
    select: { id: true, layout: true },
  });
  const layout = plan?.layout as unknown as typeof rougemontLayout | undefined;
  if (!plan || !layout || !Array.isArray(layout.seats)) return "Libellés du plan Rougemont : plan absent.";
  const marks = layout.marks ?? [];
  const added = SIDE_MARKS.filter((m) => !marks.some((o) => o.text.fr === m.text.fr));
  await prisma.seatPlan.update({
    where: { id: plan.id },
    data: {
      layout: { ...layout, marks: [...marks, ...added], rowNumbers: true } as unknown as Prisma.InputJsonValue,
    },
  });
  return `Libellés du plan Rougemont : ${added.length} libellé(s) ajouté(s), numéros de rang affichés.`;
}

/** Sièges manquants des séances, d'après le plan tel qu'il est en base. */
async function syncRougemont() {
  const plan = await prisma.seatPlan.findUnique({
    where: { slug: ROUGEMONT_PLAN_SLUG },
    select: { layout: true, sessions: { select: { id: true } } },
  });
  const layout = plan?.layout as unknown as typeof rougemontLayout | undefined;
  if (!plan || !Array.isArray(layout?.seats)) return { sessions: 0, created: 0 };
  let created = 0;
  for (const session of plan.sessions) {
    const { count } = await prisma.sessionSeat.createMany({
      data: layout.seats.map((s) => ({
        sessionId: session.id,
        seatKey: s.key,
        zone: s.zone,
      })),
      skipDuplicates: true,
    });
    created += count;
  }
  return { sessions: plan.sessions.length, created };
}

/** Joue une reprise une seule fois par base, même si l'admin a défait son résultat depuis. */
async function once(key: string, run: () => Promise<string>) {
  const done = await prisma.setupStep.findUnique({ where: { key }, select: { key: true } });
  if (done) return;
  const summary = await run();
  await prisma.setupStep.create({ data: { key } });
  console.log(`  ${summary}`);
}

const NAV_LINKS = [
  { label: "Festival", href: `${SITE}/index.html` },
  { label: "Agenda", href: `${SITE}/agenda.html` },
  { label: "Contact", href: `${SITE}/contact.html` },
];

/** Logo, couleurs du site, présentation et menu, sans écraser ce que l'admin a saisi. */
async function applyIdentity(organizerId: string): Promise<string> {
  const o = await prisma.organizer.findUniqueOrThrow({
    where: { id: organizerId },
    select: { logoUrl: true, brandPrimary: true, brandAccent: true, description: true, navLinks: true },
  });
  const data: Prisma.OrganizerUpdateInput = {};
  if (!o.logoUrl) data.logoUrl = "/partners/gstaad-nymf/logo.png";
  // Rose du logo pour les boutons (texte blanc 5,2:1), bleu nuit du site pour les titres.
  if (!o.brandPrimary) data.brandPrimary = "#C7277F";
  if (!o.brandAccent) data.brandAccent = "#001A2F";
  if (o.description == null) data.description = ORGANIZER_DESCRIPTION;
  if (!Array.isArray(o.navLinks) || o.navLinks.length === 0) data.navLinks = NAV_LINKS;
  if (Object.keys(data).length) {
    await prisma.organizer.update({ where: { id: organizerId }, data });
  }
  return `Identité : ${Object.keys(data).join(", ") || "déjà renseignée dans l'admin"}.`;
}

/** Programme détaillé, genres et visuel, là où le texte d'origine n'a pas été retouché. */
async function applyProgramme(organizerId: string): Promise<string> {
  let texts = 0;
  let titles = 0;
  let labels = 0;
  let covers = 0;

  let renamed = "";
  const legacyVenue = await prisma.venue.findFirst({
    where: { name: LEGACY_STJOSEPH, city: VENUES.STJOSEPH.city },
    select: { id: true },
  });
  const currentVenue = await prisma.venue.findFirst({
    where: { name: VENUES.STJOSEPH.name, city: VENUES.STJOSEPH.city },
    select: { id: true },
  });
  if (legacyVenue && !currentVenue) {
    await prisma.venue.update({ where: { id: legacyVenue.id }, data: { name: VENUES.STJOSEPH.name } });
    renamed = ` Lieu renommé ${VENUES.STJOSEPH.name}.`;
  }

  for (const concert of CONCERTS) {
    const programme = PROGRAMME[`${concert.date} ${concert.artist}`];
    if (!programme) continue;
    const event = await prisma.event.findFirst({
      where: { slug: concertSlug(concert), organizerId },
      select: {
        id: true,
        title: true,
        description: true,
        coverImage: true,
        sessions: { select: { id: true, label: true } },
      },
    });
    if (!event) continue;

    const v = VENUES[concert.venue];
    const untouched = new Set(
      [v.name, ...(v.formerNames ?? [])].map((name) => genericDescription(name, v.city).fr),
    );
    const data: Prisma.EventUpdateInput = {};
    const text = event.description as Partial<Tr> | null;
    if (!text?.fr || untouched.has(text.fr)) {
      data.description = programmeDescription(programme, concert.venue);
      texts += 1;
    }
    const title = event.title as Partial<Tr> | null;
    if (title?.fr === concert.artist && programme.title !== concert.artist) {
      data.title = same(programme.title);
      titles += 1;
    }
    if (event.coverImage === LEGACY_COVER) {
      data.coverImage = COVER;
      covers += 1;
    }
    if (Object.keys(data).length) {
      await prisma.event.update({ where: { id: event.id }, data });
    }

    const legacyLabel = concert.series ? SERIES[concert.series].fr : undefined;
    for (const session of event.sessions) {
      const label = session.label as Partial<Tr> | null;
      if (!label?.fr || label.fr === legacyLabel) {
        await prisma.eventSession.update({
          where: { id: session.id },
          data: { label: GENRES[programme.genre] },
        });
        labels += 1;
      }
    }
  }
  return `Programme : ${texts} textes, ${titles} titres, ${labels} genres, ${covers} visuels.${renamed}`;
}

/**
 * Adresses définitives, coordonnées de la carte et noms officiels des lieux.
 * Les textes qui citent encore l'ancien nom suivent ; un texte réécrit dans
 * l'admin ne contient plus la ligne d'origine et reste tel quel.
 */
async function applyAddresses(organizerId: string): Promise<string> {
  const renamed: [string, string][] = [];
  let venues = 0;
  for (const key of ["ROUGEMONT", "STJOSEPH", "LANDHAUS"] as const) {
    const v = VENUES[key];
    const names = [v.name, ...(v.formerNames ?? [])];
    const rows = await prisma.venue.findMany({
      where: { name: { in: names }, city: v.city },
      select: { id: true, name: true },
    });
    for (const row of rows) {
      await prisma.venue.update({
        where: { id: row.id },
        data: { name: v.name, address: v.address, zip: v.zip, lat: v.lat, lng: v.lng },
      });
      venues += 1;
      if (row.name !== v.name) {
        // Les textes générés jusqu'ici écrivaient toujours « nom, ville ».
        renamed.push([`${row.name}, ${v.city}`, placeLine(v.name, v.city)]);
      }
    }
  }

  let texts = 0;
  if (renamed.length) {
    const events = await prisma.event.findMany({
      where: { organizerId },
      select: { id: true, description: true },
    });
    for (const event of events) {
      const text = event.description as Partial<Tr> | null;
      if (!text) continue;
      let changed = false;
      const next: Partial<Tr> = { ...text };
      for (const lang of LANGS) {
        let value = next[lang];
        if (!value) continue;
        for (const [from, to] of renamed) {
          if (value.includes(`. ${from}.`)) {
            value = value.replace(`. ${from}.`, `. ${to}.`);
            changed = true;
          }
        }
        next[lang] = value;
      }
      if (changed) {
        await prisma.event.update({ where: { id: event.id }, data: { description: next } });
        texts += 1;
      }
    }
  }
  return `Adresses : ${venues} lieu(x) à jour, ${texts} texte(s) suivent le nouveau nom.`;
}

/**
 * Visuels officiels du festival (module agenda de gstaadnewyearmusicfestival.ch),
 * crédit photo imprimé dans l'image, agrandis dans `public/covers/gstaad/`.
 * Clé : date et artiste du concert, ou nom de la conférence.
 */
const VISUALS: Record<string, string> = {
  "2026-12-26 Grigoryan / Antonyan": "2026-12-26-grigoryan",
  "2026-12-27 Ensemble Mare Nostrum": "2026-12-27-mare-nostrum",
  "2026-12-27 Fuchs / Cemin": "2026-12-27-fuchs",
  "2026-12-28 Berry / Pérot / Goimard": "2026-12-28-berry-perot",
  "2026-12-28 Edris / Pati / Pordoy": "2026-12-28-edris-pati",
  "2026-12-29 Angioloni / Masson": "2026-12-29-angioloni",
  "2026-12-29 Grigolo": "2026-12-29-grigolo",
  "2026-12-30 Nelson Monfort": "2026-12-30-monfort",
  "2026-12-30 Spyres / Pordoy": "2026-12-30-spyres",
  "2027-01-01 Sirolli / Pikulski": "2027-01-01-sirolli",
  "2027-01-02 Michèle Larivière": "2027-01-02-lariviere",
  "2027-01-02 Oropesa / Tézier / Praticò": "2027-01-02-oropesa-tezier",
  "2027-01-03 Bernheim / Matheson": "2027-01-03-bernheim",
  "2027-01-03 Mkhitaryan / Zhilikhovsky": "2027-01-03-mkhitaryan",
  "2027-01-04 Ryan-Dugelay": "2027-01-04-ryan-dugelay",
  "2027-01-04 Pagano": "2027-01-04-pagano",
  "2027-01-05 Arderíus": "2027-01-05-arderius",
  "2027-01-05 Amadi / Belkin": "2027-01-05-amadi-belkin",
  "2027-01-06 Chenaux": "2027-01-06-chenaux",
  "2027-01-06 Schmitt / Reyes": "2027-01-06-schmitt-reyes",
  "2027-01-07 Earl Rose": "2027-01-07-earl-rose",
  "2027-01-08 Trio Nebelmeer": "2027-01-08-nebelmeer",
  "2027-01-08 Jany McPherson Trio": "2027-01-08-mcpherson",
  "2027-01-09 Martina Meola": "2027-01-09-meola",
  "2027-01-10 Alexandros Kapelis": "2027-01-10-kapelis",
};

/** Types d'événement de l'agenda du festival, dans son ordre. */
const AGENDA_TAGS: Record<string, Genre[]> = {
  "2026-12-26 Grigoryan / Antonyan": ["belcanto"],
  "2026-12-27 Ensemble Mare Nostrum": ["baroque"],
  "2026-12-27 Fuchs / Cemin": ["belcanto"],
  "2026-12-28 Berry / Pérot / Goimard": ["belcanto", "young"],
  "2026-12-28 Edris / Pati / Pordoy": ["duos", "belcanto"],
  "2026-12-29 Angioloni / Masson": ["belcanto"],
  "2026-12-29 Grigolo": ["belcanto"],
  "2026-12-30 Nelson Monfort": ["talk"],
  "2026-12-30 Spyres / Pordoy": ["duos", "belcanto"],
  "2027-01-01 Sirolli / Pikulski": ["belcanto", "broadway"],
  "2027-01-02 Michèle Larivière": ["talk"],
  "2027-01-02 Oropesa / Tézier / Praticò": ["duos", "belcanto"],
  "2027-01-03 Bernheim / Matheson": ["belcanto"],
  "2027-01-03 Mkhitaryan / Zhilikhovsky": ["duos", "belcanto"],
  "2027-01-04 Ryan-Dugelay": ["young", "pianoSeries"],
  "2027-01-04 Pagano": ["young", "celloSeries"],
  "2027-01-05 Arderíus": ["young", "celloSeries"],
  "2027-01-05 Amadi / Belkin": ["masters", "celloSeries"],
  "2027-01-06 Chenaux": ["young", "celloSeries"],
  "2027-01-06 Schmitt / Reyes": ["literary"],
  "2027-01-07 Earl Rose": ["jazz"],
  "2027-01-08 Trio Nebelmeer": ["young"],
  "2027-01-08 Jany McPherson Trio": ["jazz"],
  "2027-01-09 Martina Meola": ["young", "pianoSeries"],
  "2027-01-10 Alexandros Kapelis": ["masters", "pianoSeries"],
};

/**
 * Page « Focus » du festival : présentation traduite, citation de presse en
 * français seulement (langue d'origine, pas de traduction d'un critique).
 */
const FOCUS: Record<string, Tr> = {
  grigoryan: {
    fr: "Juliana Grigoryan, soprano — Liù dans Turandot au Metropolitan Opera de New York et Mimì au Royal Opera House de Londres. Lauréate de plusieurs concours internationaux, dont Operalia en 2022.\n« La jeune soprano arménienne Juliana Grigoryan est une Mimì de rêve, éblouissante, se hissant d’emblée au niveau des grandes interprètes du rôle. » (Résonances lyriques, novembre 2025)",
    en: "Juliana Grigoryan, soprano — Liù in Turandot at the Metropolitan Opera in New York and Mimì at the Royal Opera House in London. Winner of several international competitions, including Operalia in 2022.",
    de: "Juliana Grigoryan, Sopran — Liù in Turandot an der Metropolitan Opera in New York und Mimì am Royal Opera House in London. Preisträgerin mehrerer internationaler Wettbewerbe, darunter Operalia 2022.",
    it: "Juliana Grigoryan, soprano — Liù in Turandot al Metropolitan Opera di New York e Mimì alla Royal Opera House di Londra. Vincitrice di diversi concorsi internazionali, tra cui Operalia nel 2022.",
    es: "Juliana Grigoryan, soprano — Liù en Turandot en el Metropolitan Opera de Nueva York y Mimì en la Royal Opera House de Londres. Ganadora de varios concursos internacionales, entre ellos Operalia en 2022.",
  },
  fuchs: {
    fr: "Julie Fuchs, soprano — Junon dans Ercole amante d’Antonia Bembo à l’Opéra Bastille ; Adina dans L’Elisir d’amore au Staatsoper de Berlin en septembre 2026.\n« La déesse Junon est interprétée par Julie Fuchs, resplendissante. La voix ronde et résonnante emplit la salle d’une couleur dorée. » (Olga Szymczyk, Olyrix, mai 2026)",
    en: "Julie Fuchs, soprano — Juno in Antonia Bembo’s Ercole amante at the Opéra Bastille; Adina in L’elisir d’amore at the Berlin Staatsoper in September 2026.",
    de: "Julie Fuchs, Sopran — Juno in Antonia Bembos Ercole amante an der Opéra Bastille; Adina in L’elisir d’amore an der Staatsoper Berlin im September 2026.",
    it: "Julie Fuchs, soprano — Giunone nell’Ercole amante di Antonia Bembo all’Opéra Bastille; Adina nell’Elisir d’amore alla Staatsoper di Berlino nel settembre 2026.",
    es: "Julie Fuchs, soprano — Juno en Ercole amante de Antonia Bembo en la Opéra Bastille; Adina en L’elisir d’amore en la Staatsoper de Berlín en septiembre de 2026.",
  },
  edris: {
    fr: "Amina Edris, soprano — sensible Micaëla dans Carmen à l’Opéra Bastille en février 2026. Prochainement Manon de Massenet à Wellington puis à San Francisco, face au Des Grieux de son mari, Pene Pati.\n« Amina Edris s’affirme comme un des talents les plus singuliers de la planète lyrique, qu’elle ne cesse d’enflammer par ses charmes vocaux et un don d’actrice qui n’appartient qu’aux plus grandes. » (Emmanuel Dupuy, Diapason, 2026)",
    en: "Amina Edris, soprano — a sensitive Micaëla in Carmen at the Opéra Bastille in February 2026. Coming up: Massenet’s Manon in Wellington, then in San Francisco opposite her husband Pene Pati as Des Grieux.",
    de: "Amina Edris, Sopran — eine feinfühlige Micaëla in Carmen an der Opéra Bastille im Februar 2026. Demnächst Massenets Manon in Wellington und in San Francisco, an der Seite ihres Mannes Pene Pati als Des Grieux.",
    it: "Amina Edris, soprano — una sensibile Micaëla in Carmen all’Opéra Bastille nel febbraio 2026. Prossimamente Manon di Massenet a Wellington e poi a San Francisco, accanto al marito Pene Pati nel ruolo di Des Grieux.",
    es: "Amina Edris, soprano — una sensible Micaëla en Carmen en la Opéra Bastille en febrero de 2026. Próximamente, Manon de Massenet en Wellington y luego en San Francisco, junto a su marido Pene Pati como Des Grieux.",
  },
  pati: {
    fr: "Pene Pati, ténor — un Werther triomphal à l’Opéra-Comique. L’un des ténors lyriques les plus remarquables de sa génération, salué dans le répertoire français (Gounod, Massenet) et le bel canto italien (Donizetti, Bellini).\n« Le ténor samoan, qui triomphe dans la nouvelle production du metteur en scène Ted Huffman, confirme qu’il est aujourd’hui l’un des interprètes majeurs de l’opéra français. » (Marie-Aude Roux, Le Monde, janvier 2026)",
    en: "Pene Pati, tenor — a triumphant Werther at the Opéra-Comique in Paris. One of the most remarkable lyric tenors of his generation, acclaimed in the French repertoire (Gounod, Massenet) and Italian bel canto (Donizetti, Bellini).",
    de: "Pene Pati, Tenor — ein umjubelter Werther an der Opéra-Comique in Paris. Einer der bemerkenswertesten lyrischen Tenöre seiner Generation, gefeiert im französischen Repertoire (Gounod, Massenet) und im italienischen Belcanto (Donizetti, Bellini).",
    it: "Pene Pati, tenore — un Werther trionfale all’Opéra-Comique di Parigi. Uno dei tenori lirici più notevoli della sua generazione, acclamato nel repertorio francese (Gounod, Massenet) e nel belcanto italiano (Donizetti, Bellini).",
    es: "Pene Pati, tenor — un Werther triunfal en la Opéra-Comique de París. Uno de los tenores líricos más notables de su generación, aclamado en el repertorio francés (Gounod, Massenet) y el bel canto italiano (Donizetti, Bellini).",
  },
  oropesa: {
    fr: "Lisette Oropesa, soprano — reine du bel canto. Cette saison : Maria Stuarda au Metropolitan Opera (novembre-décembre 2026), puis Gilda dans Rigoletto aux côtés de Ludovic Tézier à l’Opéra de Monte-Carlo (février 2027).\n« Lisette Oropesa triomphe sur les plus grandes scènes grâce à son timbre tout en rondeur et des suraigus lumineux : la soprano est aujourd’hui l’interprète idéale du bel canto. » (Aurélie Moreau, France Musique, avril 2025)",
    en: "Lisette Oropesa, soprano — queen of bel canto. This season: Maria Stuarda at the Metropolitan Opera (November–December 2026), then Gilda in Rigoletto alongside Ludovic Tézier at the Opéra de Monte-Carlo (February 2027).",
    de: "Lisette Oropesa, Sopran — Königin des Belcanto. In dieser Saison: Maria Stuarda an der Metropolitan Opera (November–Dezember 2026), dann Gilda in Rigoletto an der Seite von Ludovic Tézier an der Opéra de Monte-Carlo (Februar 2027).",
    it: "Lisette Oropesa, soprano — regina del belcanto. In questa stagione: Maria Stuarda al Metropolitan Opera (novembre-dicembre 2026), poi Gilda in Rigoletto accanto a Ludovic Tézier all’Opéra de Monte-Carlo (febbraio 2027).",
    es: "Lisette Oropesa, soprano — reina del bel canto. Esta temporada: Maria Stuarda en el Metropolitan Opera (noviembre-diciembre de 2026) y después Gilda en Rigoletto junto a Ludovic Tézier en la Ópera de Montecarlo (febrero de 2027).",
  },
  tezier: {
    fr: "Ludovic Tézier, baryton — l’orfèvre du chant, considéré par de nombreux critiques comme l’héritier du grand baryton français Gabriel Bacquier.\n« Baryton exceptionnel, immense interprète de Verdi, Ludovic Tézier sait tout sublimer et transformer en or tout ce qu’il chante, de Mozart à Verdi, et maintenant Wagner. » (Marie-Thérèse Werling, Résonances lyriques, octobre 2025)",
    en: "Ludovic Tézier, baritone — the goldsmith of song, seen by many critics as the heir of the great French baritone Gabriel Bacquier.",
    de: "Ludovic Tézier, Bariton — der Goldschmied des Gesangs, für viele Kritiker der Erbe des grossen französischen Baritons Gabriel Bacquier.",
    it: "Ludovic Tézier, baritono — l’orafo del canto, per molti critici l’erede del grande baritono francese Gabriel Bacquier.",
    es: "Ludovic Tézier, barítono — el orfebre del canto, para muchos críticos el heredero del gran barítono francés Gabriel Bacquier.",
  },
  bernheim: {
    fr: "Benjamin Bernheim, ténor — deux prises de rôle en 2026-2027 : Cavaradossi dans Tosca au Staatsoper Unter den Linden de Berlin (octobre 2026) et Don José dans Carmen à la Bayerische Staatsoper (avril 2027).\n« La beauté du timbre, la clarté lumineuse du chant et de la diction, la fluidité du phrasé, l’usage si fin de la nuance et de la demi-teinte, et la puissance éclatante de la projection sont autant de qualités qui laissent béat. » (Christophe Candoni, Sceneweb, mars 2025, à propos de Werther)",
    en: "Benjamin Bernheim, tenor — two role debuts in 2026–2027: Cavaradossi in Tosca at the Staatsoper Unter den Linden in Berlin (October 2026) and Don José in Carmen at the Bayerische Staatsoper (April 2027).",
    de: "Benjamin Bernheim, Tenor — zwei Rollendebüts 2026–2027: Cavaradossi in Tosca an der Staatsoper Unter den Linden in Berlin (Oktober 2026) und Don José in Carmen an der Bayerischen Staatsoper (April 2027).",
    it: "Benjamin Bernheim, tenore — due debutti nel 2026-2027: Cavaradossi in Tosca alla Staatsoper Unter den Linden di Berlino (ottobre 2026) e Don José in Carmen alla Bayerische Staatsoper (aprile 2027).",
    es: "Benjamin Bernheim, tenor — dos debuts en 2026-2027: Cavaradossi en Tosca en la Staatsoper Unter den Linden de Berlín (octubre de 2026) y Don José en Carmen en la Bayerische Staatsoper (abril de 2027).",
  },
  mkhitaryan: {
    fr: "Kristina Mkhitaryan, soprano — une Micaëla ovationnée au Metropolitan Opera, une Leïla bouleversante au Wiener Staatsoper. Micaëla au Festival de Salzbourg à l’été 2026, Mimì au Metropolitan Opera en octobre 2026.\n« Une Leïla tendre, rapidement bouleversante, avec de beaux aigus et un legato impeccablement maîtrisé. » (ConcertClassic, juin 2026)",
    en: "Kristina Mkhitaryan, soprano — an acclaimed Micaëla at the Metropolitan Opera, a moving Leïla at the Wiener Staatsoper. Micaëla at the Salzburg Festival in summer 2026, Mimì at the Met in October 2026.",
    de: "Kristina Mkhitaryan, Sopran — eine umjubelte Micaëla an der Metropolitan Opera, eine bewegende Leïla an der Wiener Staatsoper. Micaëla bei den Salzburger Festspielen im Sommer 2026, Mimì an der Met im Oktober 2026.",
    it: "Kristina Mkhitaryan, soprano — una Micaëla acclamata al Metropolitan Opera, una Leïla commovente alla Wiener Staatsoper. Micaëla al Festival di Salisburgo nell’estate 2026, Mimì al Met nell’ottobre 2026.",
    es: "Kristina Mkhitaryan, soprano — una Micaëla ovacionada en el Metropolitan Opera, una Leïla conmovedora en la Wiener Staatsoper. Micaëla en el Festival de Salzburgo en el verano de 2026, Mimì en el Met en octubre de 2026.",
  },
  zhilikhovsky: {
    fr: "Andrey Zhilikhovsky, baryton — Sharpless très remarqué dans Madama Butterfly au Grand Théâtre de Genève, Comte Almaviva dans Le Mariage de Figaro au Royal Opera House de Londres.\n« Andrey Zhilikhovsky prête à son magnifique Sharpless une humanité grave. » (André Peyrègne, ClassiqueNews, avril 2026)",
    en: "Andrey Zhilikhovsky, baritone — a much-noticed Sharpless in Madama Butterfly at the Grand Théâtre de Genève, Count Almaviva in The Marriage of Figaro at the Royal Opera House in London.",
    de: "Andrey Zhilikhovsky, Bariton — ein vielbeachteter Sharpless in Madama Butterfly am Grand Théâtre de Genève, Graf Almaviva in Die Hochzeit des Figaro am Royal Opera House in London.",
    it: "Andrey Zhilikhovsky, baritono — uno Sharpless molto apprezzato in Madama Butterfly al Grand Théâtre de Genève, il Conte d’Almaviva nelle Nozze di Figaro alla Royal Opera House di Londra.",
    es: "Andrey Zhilikhovsky, barítono — un Sharpless muy destacado en Madama Butterfly en el Grand Théâtre de Genève, el Conde de Almaviva en Las bodas de Fígaro en la Royal Opera House de Londres.",
  },
  rose: {
    fr: "Earl Rose, piano — l’élégance harmonique. Compositeur, pianiste, arrangeur et chef d’orchestre américain, lauréat d’un Emmy Award (14 nominations) et de trois ASCAP Awards ; son jeu réunit le jazz, les standards américains et la musique de film.\n« Earl Rose appartient à cette catégorie de musiciens capables de faire dialoguer la tradition classique et l’esprit du jazz avec une élégance naturelle. Son piano chante, respire et raconte. » (Steinway)",
    en: "Earl Rose, piano — harmonic elegance. American composer, pianist, arranger and conductor, winner of an Emmy Award (14 nominations) and three ASCAP Awards; his playing brings together jazz, American standards and film music.",
    de: "Earl Rose, Klavier — harmonische Eleganz. Amerikanischer Komponist, Pianist, Arrangeur und Dirigent, Gewinner eines Emmy Award (14 Nominierungen) und dreier ASCAP Awards; sein Spiel verbindet Jazz, amerikanische Standards und Filmmusik.",
    it: "Earl Rose, pianoforte — l’eleganza armonica. Compositore, pianista, arrangiatore e direttore d’orchestra americano, vincitore di un Emmy Award (14 candidature) e di tre ASCAP Awards; il suo pianismo unisce jazz, standard americani e musica da film.",
    es: "Earl Rose, piano — la elegancia armónica. Compositor, pianista, arreglista y director de orquesta estadounidense, ganador de un Emmy (14 nominaciones) y de tres premios ASCAP; su piano une jazz, estándares estadounidenses y música de cine.",
  },
  meola: {
    fr: "Martina Meola, piano — la très jeune pianiste italienne adoubée par Martha Argerich. Lauréate du 4e Concours Jeune Chopin en Suisse, soutenue par Martha Argerich, marraine du concours et présidente du jury. D’origine italo-moldave, elle a commencé le piano à six ans à Chișinău et étudie aujourd’hui au Conservatoire de Milan.\n« Sa jeunesse s’exprime à la fois dans ses doigts et dans son cœur. » (Institut Chopin, 2026)",
    en: "Martina Meola, piano — the very young Italian pianist endorsed by Martha Argerich. Winner of the 4th Young Chopin Competition in Switzerland, supported by Martha Argerich, the competition’s patron and jury president. Of Italian-Moldovan origin, she began the piano aged six in Chișinău and now studies at the Milan Conservatory.",
    de: "Martina Meola, Klavier — die sehr junge italienische Pianistin, gefördert von Martha Argerich. Preisträgerin des 4. Concours Jeune Chopin in der Schweiz, unterstützt von Martha Argerich, Patin des Wettbewerbs und Jurypräsidentin. Italienisch-moldauischer Herkunft, begann sie mit sechs Jahren in Chișinău mit dem Klavierspiel und studiert heute am Konservatorium Mailand.",
    it: "Martina Meola, pianoforte — la giovanissima pianista italiana sostenuta da Martha Argerich. Vincitrice del 4° Concorso Giovane Chopin in Svizzera, sostenuta da Martha Argerich, madrina del concorso e presidente della giuria. Di origine italo-moldava, ha iniziato il pianoforte a sei anni a Chișinău e studia oggi al Conservatorio di Milano.",
    es: "Martina Meola, piano — la jovencísima pianista italiana respaldada por Martha Argerich. Ganadora del 4.º Concurso Joven Chopin en Suiza, apoyada por Martha Argerich, madrina del concurso y presidenta del jurado. De origen italo-moldavo, empezó el piano a los seis años en Chișinău y estudia hoy en el Conservatorio de Milán.",
  },
};

const FOCUS_BY_CONCERT: Record<string, (keyof typeof FOCUS)[]> = {
  "2026-12-26 Grigoryan / Antonyan": ["grigoryan"],
  "2026-12-27 Fuchs / Cemin": ["fuchs"],
  "2026-12-28 Edris / Pati / Pordoy": ["edris", "pati"],
  "2027-01-02 Oropesa / Tézier / Praticò": ["oropesa", "tezier"],
  "2027-01-03 Bernheim / Matheson": ["bernheim"],
  "2027-01-03 Mkhitaryan / Zhilikhovsky": ["mkhitaryan", "zhilikhovsky"],
  "2027-01-07 Earl Rose": ["rose"],
  "2027-01-09 Martina Meola": ["meola"],
};

/** Étiquettes de l'agenda, là où l'admin n'en a pas encore saisi. */
async function applyTags(organizerId: string): Promise<string> {
  const keyed = [
    ...CONCERTS.map((c) => ({ key: `${c.date} ${c.artist}`, slug: concertSlug(c) })),
    ...TALKS.map((t) => ({ key: `${t.date} ${t.slugName}`, slug: concertSlug({ date: t.date, artist: t.slugName }) })),
  ];
  let count = 0;
  for (const { key, slug } of keyed) {
    const genres = AGENDA_TAGS[key];
    if (!genres) continue;
    const tags = {} as Tr;
    for (const lang of LANGS) tags[lang] = genres.map((g) => GENRES[g][lang]).join(", ");
    const { count: n } = await prisma.event.updateMany({
      where: { slug, organizerId, tags: { equals: Prisma.DbNull } },
      data: { tags },
    });
    count += n;
  }
  return `Étiquettes : ${count} événement(s).`;
}

/** Bloc « Focus » inséré avant le pied de la description, une seule fois. */
async function applyFocus(organizerId: string): Promise<string> {
  let count = 0;
  for (const concert of CONCERTS) {
    const artists = FOCUS_BY_CONCERT[`${concert.date} ${concert.artist}`];
    if (!artists) continue;
    const event = await prisma.event.findFirst({
      where: { slug: concertSlug(concert), organizerId },
      select: { id: true, description: true },
    });
    if (!event) continue;
    const text = { ...((event.description as Partial<Tr> | null) ?? {}) };
    let changed = false;
    for (const lang of LANGS) {
      const current = text[lang];
      if (current == null) continue;
      const block = ["Focus", ...artists.map((a) => FOCUS[a][lang])].join("\n\n");
      if (current.includes(FOCUS[artists[0]][lang].slice(0, 40))) continue;
      const footer = current.lastIndexOf("Gstaad New Year Music Festival, 21");
      text[lang] =
        footer > 0
          ? `${current.slice(0, footer)}${block}\n\n${current.slice(footer)}`
          : `${current}\n\n${block}`;
      changed = true;
    }
    if (!changed) continue;
    await prisma.event.update({ where: { id: event.id }, data: { description: text } });
    count += 1;
  }
  return `Focus : ${count} description(s) enrichie(s).`;
}

/** Ligne de crédit ajoutée par la première reprise des portraits, désormais dans l'image. */
const PORTRAIT_CREDIT = /\n\n(Photos?|Fotos?) ?: [^\n]*$/;

async function applyVisuals(organizerId: string): Promise<string> {
  const keyed = [
    ...CONCERTS.map((c) => ({ key: `${c.date} ${c.artist}`, slug: concertSlug(c) })),
    ...TALKS.map((t) => ({ key: `${t.date} ${t.slugName}`, slug: concertSlug({ date: t.date, artist: t.slugName }) })),
  ];
  let covers = 0;
  for (const { key, slug } of keyed) {
    const file = VISUALS[key];
    if (!file) continue;
    const event = await prisma.event.findFirst({
      where: { slug, organizerId },
      select: { id: true, coverImage: true, description: true },
    });
    if (!event) continue;
    const data: Prisma.EventUpdateInput = {};
    // Un visuel choisi depuis l'admin reste en place.
    const ours =
      !event.coverImage ||
      event.coverImage === COVER ||
      event.coverImage === LEGACY_COVER ||
      event.coverImage.startsWith("/covers/gstaad/");
    if (ours) {
      data.coverImage = `/covers/gstaad/${file}.jpg`;
      covers += 1;
    }
    const text = event.description as Partial<Tr> | null;
    if (text && LANGS.some((lang) => text[lang] && PORTRAIT_CREDIT.test(text[lang]!))) {
      const next: Partial<Tr> = { ...text };
      for (const lang of LANGS) if (next[lang]) next[lang] = next[lang]!.replace(PORTRAIT_CREDIT, "");
      data.description = next;
    }
    if (Object.keys(data).length) await prisma.event.update({ where: { id: event.id }, data });
  }
  return `Visuels officiels : ${covers} événement(s).`;
}

/**
 * Places invités (mécènes, amis, presse, artistes) du fichier d'Illyria du
 * 1er octobre 2026, plus 12 places pour les concerts de 15 h qu'il ne liste pas.
 * Clé : date et artiste du concert.
 */
const INVITATIONS: Record<string, number> = {
  "2026-12-26 Grigoryan / Antonyan": 128,
  "2026-12-27 Ensemble Mare Nostrum": 38,
  "2026-12-27 Fuchs / Cemin": 88,
  "2026-12-28 Berry / Pérot / Goimard": 12,
  "2026-12-28 Edris / Pati / Pordoy": 103,
  "2026-12-29 Angioloni / Masson": 12,
  "2026-12-29 Grigolo": 68,
  "2026-12-30 Spyres / Pordoy": 92,
  "2027-01-01 Sirolli / Pikulski": 108,
  "2027-01-02 Oropesa / Tézier / Praticò": 110,
  "2027-01-03 Bernheim / Matheson": 108,
  "2027-01-03 Mkhitaryan / Zhilikhovsky": 92,
  "2027-01-04 Ryan-Dugelay": 12,
  "2027-01-04 Pagano": 48,
  "2027-01-05 Arderíus": 12,
  "2027-01-05 Amadi / Belkin": 54,
  "2027-01-06 Chenaux": 12,
  "2027-01-06 Schmitt / Reyes": 58,
  "2027-01-07 Earl Rose": 50,
  "2027-01-08 Trio Nebelmeer": 12,
  "2027-01-08 Jany McPherson Trio": 44,
  "2027-01-09 Martina Meola": 44,
  "2027-01-10 Alexandros Kapelis": 44,
};

const INVITATION_NOTE = "Invitations Illyria (liste du 1er octobre 2026)";

type LayoutSeat = (typeof rougemontLayout.seats)[number];

/**
 * Ordre de blocage : Premium, catégorie 1 de la nef du rang le plus proche de
 * la scène vers le fond, catégorie 1 des côtés de la scène, puis catégories 2
 * et 3. Dans un rang de nef, du centre vers l'allée latérale.
 */
function seatRank(seat: LayoutSeat, centerX: number): number[] {
  const nave = seat.section === "NEF";
  const tier =
    seat.zone === "PREMIUM" ? 0 : seat.zone === "CAT1" ? (nave ? 1 : 2) : seat.zone === "CAT2" ? 3 : 4;
  const row = Number(seat.row) || 0;
  return nave
    ? [tier, row, Math.abs(seat.x - centerX)]
    : [tier, row, Number(seat.number) || 0, seat.x < centerX ? 0 : 1];
}

function compareRanks(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Concerts sur plan : bloque les meilleures places libres jusqu'au nombre
 * demandé (les places déjà bloquées comptent). Les concerts à catégories
 * s'arrêtent à la catégorie 1. Placement libre : la jauge baisse d'autant.
 */
async function applyInvitations(organizerId: string): Promise<string> {
  const plan = await prisma.seatPlan.findUnique({
    where: { slug: ROUGEMONT_PLAN_SLUG },
    select: { layout: true },
  });
  const layout = plan?.layout as unknown as typeof rougemontLayout | undefined;
  if (!layout || !Array.isArray(layout.seats)) return "Invitations : plan de Rougemont introuvable.";
  const stage = layout.areas?.[0];
  const centerX = stage ? stage.x + stage.w / 2 : layout.viewBox.x + layout.viewBox.w / 2;
  const rank = new Map(layout.seats.map((s) => [s.key, seatRank(s, centerX)]));

  const lines: string[] = [];
  for (const concert of CONCERTS) {
    const wanted = INVITATIONS[`${concert.date} ${concert.artist}`];
    if (!wanted) continue;
    const event = await prisma.event.findFirst({
      where: { slug: concertSlug(concert), organizerId },
      select: { sessions: { select: { id: true, seatPlanId: true, capacity: true, sold: true }, take: 1 } },
    });
    const session = event?.sessions[0];
    if (!session) continue;

    if (!session.seatPlanId) {
      if (session.capacity == null) {
        lines.push(`${concert.date} ${concert.artist} : jauge absente, rien retiré`);
        continue;
      }
      const capacity = Math.max(session.sold, session.capacity - wanted);
      await prisma.eventSession.update({
        where: { id: session.id },
        data: { capacity, inviteSeats: session.capacity - capacity },
      });
      lines.push(`${concert.date} ${concert.artist} : jauge ${session.capacity} → ${capacity}`);
      continue;
    }

    const maxTier = concert.pricing.kind === "categories" ? 2 : 4;
    const seats = await prisma.sessionSeat.findMany({
      where: { sessionId: session.id },
      select: { seatKey: true, status: true },
    });
    const already = seats.filter((s) => s.status === "BLOCKED").length;
    const picked = seats
      .filter((s) => s.status === "AVAILABLE" && (rank.get(s.seatKey)?.[0] ?? 99) <= maxTier)
      .sort((a, b) => compareRanks(rank.get(a.seatKey)!, rank.get(b.seatKey)!))
      .slice(0, Math.max(0, wanted - already))
      .map((s) => s.seatKey);
    if (picked.length) {
      await prisma.sessionSeat.updateMany({
        where: { sessionId: session.id, seatKey: { in: picked }, status: "AVAILABLE" },
        data: { status: "BLOCKED", blockNote: INVITATION_NOTE },
      });
    }
    const missing = wanted - already - picked.length;
    lines.push(
      `${concert.date} ${concert.artist} : ${picked.length} bloquées` +
        (already ? `, ${already} déjà bloquées` : "") +
        (missing > 0 ? `, ${missing} manquantes` : ""),
    );
  }
  return `Invitations :\n    ${lines.join("\n    ")}`;
}

/** Les deux conférences : entrée sur inscription, coordonnées à saisir dans l'admin. */
async function createTalks(organizerId: string): Promise<string> {
  const venueId = await findOrCreateVenue(prisma, "YACHTCLUB");
  let created = 0;
  for (const talk of TALKS) {
    const slug = concertSlug({ date: talk.date, artist: talk.slugName });
    const exists = await prisma.event.findUnique({ where: { slug }, select: { id: true } });
    if (exists) continue;
    const title = {} as Tr;
    for (const lang of LANGS) title[lang] = `${GENRES.talk[lang]} · ${talk.title}`;
    await prisma.event.create({
      data: {
        slug,
        title,
        description: programmeDescription(talk, "YACHTCLUB"),
        status: "DRAFT",
        visibility: "PUBLIC",
        coverImage: COVER,
        onlineSale: false,
        acceptCard: false,
        acceptIban: false,
        acceptPaypal: false,
        organizerId,
        sessions: {
          create: {
            startsAt: zurich(talk.date, talk.time),
            status: "PUBLISHED",
            venueId,
            label: GENRES.talk,
          },
        },
      },
    });
    created += 1;
  }
  return `Conférences : ${created} créée(s) en brouillon, courriel ou téléphone d'inscription à renseigner.`;
}

const YACHT_CLUB_SITE = "https://www.gstaadyachtclub.com/";

/** Conférences publiées à titre informatif : inscription sur le site du Gstaad Yacht Club. */
async function publishTalks(organizerId: string): Promise<string> {
  const v = VENUES.YACHTCLUB;
  const { count: venues } = await prisma.venue.updateMany({
    where: { name: v.name, city: v.city, OR: [{ address: null }, { address: "" }] },
    data: { address: v.address, zip: v.zip, lat: v.lat, lng: v.lng },
  });
  const lines: string[] = [`adresse du lieu : ${venues ? "ajoutée" : "déjà renseignée"}`];
  for (const talk of TALKS) {
    const slug = concertSlug({ date: talk.date, artist: talk.slugName });
    const event = await prisma.event.findFirst({
      where: { slug, organizerId },
      select: { id: true, status: true, contactUrl: true, contactEmail: true, contactPhone: true },
    });
    if (!event) {
      lines.push(`${slug} : introuvable`);
      continue;
    }
    const noContact = !event.contactUrl && !event.contactEmail && !event.contactPhone;
    await prisma.event.update({
      where: { id: event.id },
      data: {
        onlineSale: false,
        ...(event.status === "DRAFT" ? { status: "PUBLISHED" } : {}),
        ...(noContact ? { contactUrl: YACHT_CLUB_SITE } : {}),
      },
    });
    lines.push(
      `${slug} : ${event.status === "DRAFT" ? "publiée" : `déjà ${event.status}`}` +
        (noContact ? ", lien du Yacht Club" : ", coordonnées de l'admin gardées"),
    );
  }
  return `Conférences au Yacht Club :\n    ${lines.join("\n    ")}`;
}

const YACHT_CLUB_NOTE = {
  fr: "Billetterie auprès du Gstaad Yacht Club.",
  en: "Tickets from the Gstaad Yacht Club.",
  de: "Tickets beim Gstaad Yacht Club.",
  it: "Biglietteria presso il Gstaad Yacht Club.",
  es: "Entradas en el Gstaad Yacht Club.",
};

/** Nom court du tarif jeunes, le prix « Gratuit » s'affichant à côté. Un nom retouché dans l'admin est gardé. */
async function renameYouthTariff(organizerId: string): Promise<string> {
  const { count } = await prisma.ticketType.updateMany({
    where: {
      session: { event: { organizerId } },
      name: { path: ["fr"], equals: OLD_YOUTH_NAME_FR },
    },
    data: { name: YOUTH_NAME },
  });
  return `Tarif jeunes renommé « ${YOUTH_NAME.fr} » sur ${count} séance(s).`;
}

/** Texte d'introduction des conférences, sans écraser celui saisi dans l'admin. */
async function noteTalks(organizerId: string): Promise<string> {
  const slugs = TALKS.map((t) => concertSlug({ date: t.date, artist: t.slugName }));
  const { count } = await prisma.event.updateMany({
    where: { slug: { in: slugs }, organizerId, contactNote: { equals: Prisma.DbNull } },
    data: { contactNote: YACHT_CLUB_NOTE },
  });
  return `Conférences au Yacht Club : texte « Billetterie » ajouté à ${count} fiche(s).`;
}

/**
 * Conférence de Michèle Larivière déplacée à l'église de Rougemont et mise en
 * vente : placement libre à 30 CHF et tarif moins de 25 ans, comme les concerts.
 * Les tarifs déjà créés dans l'admin sont gardés.
 */
async function sellLariviere(organizerId: string): Promise<string> {
  const talk = TALKS.find((t) => t.slugName === "Michèle Larivière");
  if (!talk) return "Conférence Larivière : absente du programme.";
  const slug = concertSlug({ date: talk.date, artist: talk.slugName });
  const event = await prisma.event.findFirst({
    where: { slug, organizerId },
    select: {
      id: true,
      description: true,
      sessions: { select: { id: true, _count: { select: { ticketTypes: true } } } },
    },
  });
  if (!event) return `${slug} : introuvable`;
  const venueId = await findOrCreateVenue(prisma, "ROUGEMONT");
  const capacity = VENUES.ROUGEMONT.capacity;
  const yacht = VENUES.YACHTCLUB;
  const formerPlaces = [`${yacht.name}, ${yacht.city}`, yacht.name];
  const to = placeLine(VENUES.ROUGEMONT.name, VENUES.ROUGEMONT.city);
  const current = (event.description ?? {}) as Partial<Tr>;
  const description = {} as Tr;
  for (const lang of LANGS) {
    const text = current[lang];
    const from = text && formerPlaces.find((p) => text.includes(p));
    description[lang] = text
      ? from ? text.replace(from, to) : text
      : programmeDescription(talk, "ROUGEMONT")[lang];
  }
  let tariffs = 0;
  await prisma.$transaction(async (tx) => {
    await tx.event.update({
      where: { id: event.id },
      data: {
        description,
        onlineSale: true,
        acceptCard: true,
        contactUrl: null,
        contactNote: Prisma.DbNull,
      },
    });
    for (const session of event.sessions) {
      await tx.eventSession.update({
        where: { id: session.id },
        data: { venueId, capacity, seatPlanId: null },
      });
      if (session._count.ticketTypes) continue;
      await tx.ticketType.create({
        data: { sessionId: session.id, name: UNRESERVED, priceCents: 3000, currency: "CHF", quantity: capacity, maxPerOrder: 10 },
      });
      await tx.ticketType.create({
        data: {
          sessionId: session.id,
          name: YOUTH_NAME,
          priceCents: 0,
          currency: "CHF",
          quantity: capacity,
          maxPerOrder: 2,
          maxPerPaidTicket: 2,
          requiresAttendee: true,
          maxAgeYears: 25,
        },
      });
      tariffs += 2;
    }
  });
  return `Conférence Larivière : à Rougemont, en vente (${tariffs} tarif(s) créé(s)).`;
}

/** Conférence de Michèle Larivière à l'Hôtel de Rougemont plutôt qu'à l'église. Tarifs et jauge inchangés. */
async function moveLariviereToHotel(organizerId: string): Promise<string> {
  const talk = TALKS.find((t) => t.slugName === "Michèle Larivière");
  if (!talk) return "Conférence Larivière : absente du programme.";
  const slug = concertSlug({ date: talk.date, artist: talk.slugName });
  const event = await prisma.event.findFirst({
    where: { slug, organizerId },
    select: { id: true, description: true, sessions: { select: { id: true } } },
  });
  if (!event) return `${slug} : introuvable`;
  const venueId = await findOrCreateVenue(prisma, "HOTELROUGEMONT");
  const church = VENUES.ROUGEMONT;
  const formerPlaces = [`${church.name}, ${church.city}`, church.name];
  const to = placeLine(VENUES.HOTELROUGEMONT.name, VENUES.HOTELROUGEMONT.city);
  const current = (event.description ?? {}) as Partial<Tr>;
  const description = {} as Tr;
  for (const lang of LANGS) {
    const text = current[lang];
    const from = text && formerPlaces.find((p) => text.includes(p));
    description[lang] = text
      ? from ? text.replace(from, to) : text
      : programmeDescription(talk, "HOTELROUGEMONT")[lang];
  }
  await prisma.$transaction([
    prisma.event.update({ where: { id: event.id }, data: { description } }),
    prisma.eventSession.updateMany({
      where: { id: { in: event.sessions.map((s) => s.id) } },
      data: { venueId },
    }),
  ]);
  return `Conférence Larivière : à l'${to}.`;
}

/**
 * Relecture du festival (07.10.2026) : chanteurs dans le titre du 27.12,
 * conférence Larivière à 12 h, concert du 29.12 à 15 h en « Bel canto ».
 * Une valeur déjà modifiée dans l'admin est gardée.
 */
async function applyReview20261007(organizerId: string): Promise<string> {
  const done: string[] = [];

  const mareNostrum = concertSlug({ date: "2026-12-27", artist: "Ensemble Mare Nostrum" });
  const title = same(PROGRAMME["2026-12-27 Ensemble Mare Nostrum"]!.title);
  const { count: titled } = await prisma.event.updateMany({
    where: { slug: mareNostrum, organizerId, title: { path: ["fr"], equals: "Ensemble Mare Nostrum" } },
    data: { title },
  });
  if (titled) done.push(`titre « ${title.fr} »`);

  const talk = TALKS.find((t) => t.slugName === "Michèle Larivière")!;
  const { count: moved } = await prisma.eventSession.updateMany({
    where: {
      event: { slug: concertSlug({ date: talk.date, artist: talk.slugName }), organizerId },
      startsAt: zurich(talk.date, "11:30"),
    },
    data: { startsAt: zurich(talk.date, talk.time) },
  });
  if (moved) done.push(`conférence Larivière à ${talk.time}`);

  const angioloni = concertSlug({ date: "2026-12-29", artist: "Angioloni / Masson" });
  const tags = {} as Tr;
  for (const lang of LANGS) tags[lang] = GENRES.belcanto[lang];
  const { count: retagged } = await prisma.event.updateMany({
    where: { slug: angioloni, organizerId, tags: { path: ["fr"], equals: GENRES.young.fr } },
    data: { tags },
  });
  if (retagged) done.push("29.12 à 15 h en « Bel canto »");

  return `Relecture du 07.10 : ${done.join(", ") || "déjà appliquée dans l'admin"}.`;
}

/** Demande d'Illyria (08.10.2026) : 48 places réservées pour Ettore Pagano, retirées de la jauge. */
async function reservePagano(organizerId: string): Promise<string> {
  const key = "2027-01-04 Pagano";
  const concert = CONCERTS.find((c) => `${c.date} ${c.artist}` === key)!;
  const session = await prisma.eventSession.findFirst({
    where: { event: { slug: concertSlug(concert), organizerId } },
    select: { id: true, capacity: true, sold: true },
  });
  if (!session) return `${key} : introuvable`;
  const full = VENUES[concert.venue].capacity;
  if (session.capacity !== full) return `${key} : jauge déjà réglée (${session.capacity}), inchangée`;
  const capacity = Math.max(session.sold, full - INVITATIONS[key]!);
  await prisma.eventSession.update({
    where: { id: session.id },
    data: { capacity, inviteSeats: full - capacity },
  });
  return `${key} : jauge ${full} → ${capacity}`;
}

/**
 * Placement libre : les invitations retirées de la jauge deviennent des
 * « places invités », réservables au guichet. Seules les séances dont la jauge
 * n'a pas bougé depuis sont reprises.
 */
async function countInviteSeats(organizerId: string): Promise<string> {
  const lines: string[] = [];
  for (const concert of CONCERTS) {
    const key = `${concert.date} ${concert.artist}`;
    const wanted = INVITATIONS[key];
    if (!wanted) continue;
    const session = await prisma.eventSession.findFirst({
      where: { event: { slug: concertSlug(concert), organizerId }, seatPlanId: null },
      select: { id: true, capacity: true, sold: true, inviteSeats: true },
    });
    if (!session || session.capacity == null || session.inviteSeats > 0) continue;
    const full = VENUES[concert.venue].capacity;
    if (session.capacity !== Math.max(session.sold, full - wanted)) {
      lines.push(`${key} : jauge modifiée (${session.capacity}), à régler dans l'admin`);
      continue;
    }
    await prisma.eventSession.update({
      where: { id: session.id },
      data: { inviteSeats: full - session.capacity },
    });
    lines.push(`${key} : ${full - session.capacity} places invités`);
  }
  return `Places invités :\n    ${lines.join("\n    ")}`;
}

async function main() {
  const existing = await prisma.organizer.findUnique({
    where: { slug: ORG_SLUG },
    select: { id: true },
  });
  let organizerId = existing?.id;
  if (!organizerId) {
    organizerId = await createCatalog();
    console.log(`  Catalogue créé : ${CONCERTS.length} concerts (brouillons).`);
  }
  await ensureAccount(organizerId);
  const id = organizerId;
  await once("gnymf-2026/identite", () => applyIdentity(id));
  await once("gnymf-2026/programme", () => applyProgramme(id));
  await once("gnymf-2026/conferences", () => createTalks(id));
  await once("gnymf-2026/adresses", () => applyAddresses(id));
  await once("gnymf-2026/plan-rougemont", applyRougemontLayout);
  await once("gnymf-2026/visuels-officiels", () => applyVisuals(id));
  await once("gnymf-2026/etiquettes", () => applyTags(id));
  await once("gnymf-2026/focus", () => applyFocus(id));
  const seats = await syncRougemont();
  await once("gnymf-2026/invitations-1er-octobre", () => applyInvitations(id));
  await once("gnymf-2026/conferences-yacht-club", () => publishTalks(id));
  await once("gnymf-2026/plan-rougemont-libelles", labelRougemontPlan);
  await once("gnymf-2026/conferences-billetterie", () => noteTalks(id));
  await once("gnymf-2026/tarif-moins-25-nom", () => renameYouthTariff(id));
  await once("gnymf-2026/lariviere-rougemont", () => sellLariviere(id));
  await once("gnymf-2026/lariviere-hotel-rougemont", () => moveLariviereToHotel(id));
  await once("gnymf-2026/relecture-2026-10-07", () => applyReview20261007(id));
  await once("gnymf-2026/invitations-pagano", () => reservePagano(id));
  await once("gnymf-2026/places-invites", () => countInviteSeats(id));
  console.log(
    `✅ ${ORG_NAME} : ${seats.sessions} séances sur le plan Rougemont, ${seats.created} sièges ajoutés.`,
  );
}

main()
  .catch((error) => {
    console.error(`✖ ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
