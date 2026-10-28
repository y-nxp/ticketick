import { EVENT_TIME_ZONE } from "@/lib/utils";
import { displayLink, type PromotionChannel } from "./channels";

/**
 * Texte proposé pour une publication (docs/module-promotion.md, § 2.4) :
 * gabarit déterministe, sans IA. Mêmes données, même texte : le compositeur
 * l'affiche, l'organisateur le modifie, le serveur publie ce qu'il a validé.
 *
 * Deux temps : le corps (titre, date, lieu, prix, mots-clics), que
 * l'organisateur retouche, puis la ligne du lien, ajoutée par canal parce
 * qu'elle diffère entre Facebook (lien cliquable) et Instagram (légende non
 * cliquable, § 5.4).
 *
 * Le texte est celui du public visé, pas celui de l'interface : il vit ici
 * dans les quatre langues plutôt que dans `messages/`.
 */

export const PROMOTION_LOCALES = ["fr", "de", "en", "it"] as const;
export type PromotionLocale = (typeof PROMOTION_LOCALES)[number];

export function isPromotionLocale(value: string): value is PromotionLocale {
  return (PROMOTION_LOCALES as readonly string[]).includes(value);
}

export interface TemplateVenue {
  name: string;
  city: string;
}

export interface TemplateSession {
  startsAt: Date | string;
  venue?: TemplateVenue | null;
}

export interface TemplateInput {
  locale: PromotionLocale;
  title: string;
  subtitle?: string | null;
  /**
   * Séance visée (une seule), ou toutes les dates à venir, dans l'ordre
   * chronologique.
   */
  sessions: TemplateSession[];
  /** Prix d'appel en centimes (`minPriceCents`) ; 0 : gratuit, pas de mention. */
  priceCents: number;
  /** Étiquettes de l'événement, dans la langue du texte. */
  tags: string[];
}

/** Au-delà, « + N autres dates ». */
const MAX_LISTED_DATES = 3;
/** Limite d'Instagram ; on n'en propose jamais davantage. */
export const MAX_HASHTAGS = 30;

interface Words {
  /** Assemble jour de la semaine, jour, mois et heure. */
  date(parts: DateParts): string;
  priceFrom(amount: string): string;
  moreDates(count: number): string;
  link(url: string): string;
  linkInBio(link: string): string;
  info(url: string): string;
  infoInBio(link: string): string;
}

interface DateParts {
  weekday: string;
  day: string;
  month: string;
  time: string;
}

const NBSP = " ";

const WORDS: Record<PromotionLocale, Words> = {
  fr: {
    date: (p) => `${p.weekday} ${p.day} ${p.month} à ${p.time}`,
    priceFrom: (amount) => `Billets dès ${amount}${NBSP}CHF`,
    moreDates: (n) => (n === 1 ? "+ 1 autre date" : `+ ${n} autres dates`),
    link: (url) => `👉 Réservez${NBSP}: ${url}`,
    linkInBio: (link) => `👉 Réservation${NBSP}: lien en bio ou ${link}`,
    info: (url) => `👉 Infos${NBSP}: ${url}`,
    infoInBio: (link) => `👉 Infos${NBSP}: lien en bio ou ${link}`,
  },
  de: {
    date: (p) => `${p.weekday}, ${p.day}. ${p.month}, ${p.time} Uhr`,
    priceFrom: (amount) => `Tickets ab CHF${NBSP}${amount}`,
    moreDates: (n) => (n === 1 ? "+ 1 weiterer Termin" : `+ ${n} weitere Termine`),
    link: (url) => `👉 Tickets: ${url}`,
    linkInBio: (link) => `👉 Tickets: Link in der Bio oder ${link}`,
    info: (url) => `👉 Infos: ${url}`,
    infoInBio: (link) => `👉 Infos: Link in der Bio oder ${link}`,
  },
  en: {
    date: (p) => `${p.weekday} ${p.day} ${p.month}, ${p.time}`,
    priceFrom: (amount) => `Tickets from CHF${NBSP}${amount}`,
    moreDates: (n) => (n === 1 ? "+ 1 more date" : `+ ${n} more dates`),
    link: (url) => `👉 Book now: ${url}`,
    linkInBio: (link) => `👉 Tickets: link in bio or ${link}`,
    info: (url) => `👉 Info: ${url}`,
    infoInBio: (link) => `👉 Info: link in bio or ${link}`,
  },
  it: {
    date: (p) => `${p.weekday} ${p.day} ${p.month}, ore ${p.time}`,
    priceFrom: (amount) => `Biglietti da CHF${NBSP}${amount}`,
    moreDates: (n) => (n === 1 ? "+ 1 altra data" : `+ altre ${n} date`),
    link: (url) => `👉 Prenota: ${url}`,
    linkInBio: (link) => `👉 Biglietti: link in bio o ${link}`,
    info: (url) => `👉 Info: ${url}`,
    infoInBio: (link) => `👉 Info: link in bio o ${link}`,
  },
};

const dateFormats = new Map<PromotionLocale, Intl.DateTimeFormat>();
const timeFormat = new Intl.DateTimeFormat("de-CH", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: EVENT_TIME_ZONE,
});

function dateFormat(locale: PromotionLocale): Intl.DateTimeFormat {
  let format = dateFormats.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(`${locale}-CH`, {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: EVENT_TIME_ZONE,
    });
    dateFormats.set(locale, format);
  }
  return format;
}

/**
 * Date et heure à Zurich, dans la langue du texte. Les morceaux sont
 * réassemblés ici plutôt que confiés au motif d'Intl, dont la ponctuation
 * change d'une version d'ICU à l'autre.
 */
export function formatSessionDate(startsAt: Date | string, locale: PromotionLocale): string {
  const at = new Date(startsAt);
  const parts = Object.fromEntries(
    dateFormat(locale)
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const time = Object.fromEntries(timeFormat.formatToParts(at).map((p) => [p.type, p.value]));
  return WORDS[locale].date({
    weekday: parts.weekday ?? "",
    day: parts.day ?? "",
    month: parts.month ?? "",
    time: `${time.hour}:${time.minute}`,
  });
}

/** 3500 → « 35 », 3550 → « 35.50 » : notation suisse, la même dans les quatre langues. */
export function formatAmount(cents: number): string {
  const francs = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? String(francs) : `${francs}.${String(rest).padStart(2, "0")}`;
}

/**
 * Étiquette → mot-clic : « Grands duos » → `#GrandsDuos`. Lettres et chiffres
 * seulement (accents compris) ; un mot-clic fait de chiffres seuls n'est pas
 * reconnu par les plateformes et disparaît.
 */
export function hashtag(tag: string): string | null {
  const words = tag.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const joined = words.map((w) => w.charAt(0).toLocaleUpperCase() + w.slice(1)).join("");
  if (!joined || /^\p{N}+$/u.test(joined)) return null;
  return `#${joined}`;
}

export function hashtags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const h = hashtag(tag);
    if (!h || seen.has(h.toLocaleLowerCase())) continue;
    seen.add(h.toLocaleLowerCase());
    out.push(h);
    if (out.length === MAX_HASHTAGS) break;
  }
  return out;
}

function venueText(venue: TemplateVenue): string {
  return venue.city && venue.city !== venue.name ? `${venue.name}, ${venue.city}` : venue.name;
}

/** Corps du texte, sans le lien. */
export function promotionBody(input: TemplateInput): string {
  const words = WORDS[input.locale];
  const lines: string[] = [input.title.trim()];
  const subtitle = input.subtitle?.trim();
  if (subtitle) lines.push(subtitle);
  lines.push("");

  const listed = input.sessions.slice(0, MAX_LISTED_DATES);
  const venues = new Set(
    input.sessions.map((s) => (s.venue ? venueText(s.venue) : "")).filter(Boolean),
  );
  // Un même lieu pour toutes les dates : une seule ligne de lieu, après les dates.
  const sharedVenue = venues.size === 1 ? [...venues][0] : null;

  for (const session of listed) {
    const date = formatSessionDate(session.startsAt, input.locale);
    const where = !sharedVenue && session.venue ? ` — ${venueText(session.venue)}` : "";
    lines.push(`📅 ${date}${where}`);
  }
  if (input.sessions.length > listed.length) {
    lines.push(words.moreDates(input.sessions.length - listed.length));
  }
  if (sharedVenue) lines.push(`📍 ${sharedVenue}`);
  if (input.priceCents > 0) lines.push(`🎟️ ${words.priceFrom(formatAmount(input.priceCents))}`);

  const tags = hashtags(input.tags);
  if (tags.length) lines.push("", tags.join(" "));

  return lines.join("\n");
}

export interface MessageInput {
  body: string;
  channel: PromotionChannel;
  /** Lien de campagne absolu (`campaignLink`). */
  link: string;
  locale: PromotionLocale;
  /** Faux : le lien mène à la fiche (contact), pas à une vente. */
  onlineSale: boolean;
}

/** Ligne du lien, selon le canal. */
export function linkLine({ channel, link, locale, onlineSale }: Omit<MessageInput, "body">): string {
  const words = WORDS[locale];
  if (channel === "instagram") {
    return onlineSale ? words.linkInBio(displayLink(link)) : words.infoInBio(displayLink(link));
  }
  return onlineSale ? words.link(link) : words.info(link);
}

/** Texte publié : le corps validé, puis la ligne du lien. */
export function promotionMessage(input: MessageInput): string {
  return `${input.body.trimEnd()}\n\n${linkLine(input)}`;
}
