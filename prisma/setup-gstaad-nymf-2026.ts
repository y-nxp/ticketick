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

type VenueKey = "ROUGEMONT" | "STJOSEPH" | "LANDHAUS" | "YACHTCLUB";

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
  YACHTCLUB: { name: "Gstaad Yacht Club", city: "Gstaad", zip: "3780", canton: "BE", capacity: 0 },
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
  venue: Exclude<VenueKey, "YACHTCLUB">;
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
  fr: "Gratuité moins de 25 ans",
  en: "Free – under 25",
  de: "Gratis – unter 25",
  it: "Gratuito – under 25",
  es: "Gratis – menores de 25",
};
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
  "2026-12-27 Ensemble Mare Nostrum": { title: "Ensemble Mare Nostrum", genre: "baroque", work: "Stradella, un génie, un rebelle, un fugitif…", cast: [{ name: "Niccolò Balducci", role: "soprano" }, { name: "Alex Rosen", role: "bass" }, { name: "Ensemble Mare Nostrum" }, { name: "Andrea De Carlo", role: "conductor" }] },
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
  { date: "2027-01-02", time: "11:30", slugName: "Michèle Larivière", title: "Michèle Larivière", genre: "talk", work: "Bicentenaire de la mort de Beethoven", cast: [{ name: "Michèle Larivière", role: "speakerF" }], notes: ["beethovenYear"] },
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

async function syncRougemont() {
  const found = await prisma.seatPlan.findUnique({
    where: { slug: ROUGEMONT_PLAN_SLUG },
    select: { id: true },
  });
  if (!found) return { sessions: 0, created: 0 };
  const plan = await prisma.seatPlan.update({
    where: { id: found.id },
    data: { layout: rougemontLayout as unknown as Prisma.InputJsonValue },
    select: { id: true, sessions: { select: { id: true } } },
  });
  let created = 0;
  for (const session of plan.sessions) {
    const { count } = await prisma.sessionSeat.createMany({
      data: rougemontLayout.seats.map((s) => ({
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
  const seats = await syncRougemont();
  console.log(
    `✅ ${ORG_NAME} : plan Rougemont à jour, ${seats.sessions} séances numérotées, ${seats.created} sièges ajoutés.`,
  );
}

main()
  .catch((error) => {
    console.error(`✖ ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
