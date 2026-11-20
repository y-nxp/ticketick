/**
 * Adresses des pages publiques dans la langue du visiteur.
 *
 * Les dossiers de `src/app/[locale]` gardent leur nom anglais (adresse
 * interne). Le proxy réécrit l'adresse traduite vers l'adresse interne, et la
 * navigation (`@/i18n/navigation`) fait l'inverse. Une langue absente garde
 * l'adresse interne (anglais ; l'espagnol n'existe que pour le parcours d'achat).
 *
 * Module pur : lu par le proxy, la navigation, le sitemap et les métadonnées.
 */
import type { Locale } from "./routing";

type Localized = Partial<Record<Locale, string>>;

export const LOCALIZED_PATHNAMES = {
  "/organizer": { fr: "/organisateurs", de: "/veranstalter", it: "/organizzatori" },
  "/pricing": { fr: "/tarifs", de: "/preise", it: "/prezzi" },
  "/how-it-works": { fr: "/comment-ca-marche", de: "/wie-es-funktioniert", it: "/come-funziona" },
  "/about": { fr: "/a-propos", de: "/ueber-uns", it: "/chi-siamo" },
  "/help": { fr: "/aide", de: "/hilfe", it: "/aiuto" },
  "/events/[slug]": {
    fr: "/spectacles/[slug]",
    de: "/veranstaltungen/[slug]",
    it: "/spettacoli/[slug]",
    es: "/eventos/[slug]",
  },
} as const satisfies Record<string, Localized>;

type Entry = { internal: string; localized: Localized };
const ENTRIES: Entry[] = Object.entries(LOCALIZED_PATHNAMES).map(([internal, localized]) => ({
  internal,
  localized,
}));

/** Gabarit (`/events/[slug]`) → expression qui capture les paramètres. */
function matcher(template: string): RegExp {
  const source = template
    .split("/")
    .map((part) => (/^\[[^\]]+\]$/.test(part) ? "([^/]+)" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("/");
  return new RegExp(`^${source}/?$`);
}

function fill(template: string, values: string[]): string {
  let i = 0;
  return template.replace(/\[[^\]]+\]/g, () => values[i++] ?? "");
}

function splitSuffix(href: string): [string, string] {
  const at = href.search(/[?#]/);
  return at === -1 ? [href, ""] : [href.slice(0, at), href.slice(at)];
}

function templateFor(entry: Entry, locale: string): string {
  return entry.localized[locale as Locale] ?? entry.internal;
}

/**
 * Adresse interne (sans préfixe de langue) → adresse affichée dans `locale`.
 * `/pricing#faq` en français → `/tarifs#faq`. Une adresse non traduite revient telle quelle.
 */
export function localizePath(href: string, locale: string): string {
  const [path, suffix] = splitSuffix(href);
  for (const entry of ENTRIES) {
    const m = path.match(matcher(entry.internal));
    if (m) return fill(templateFor(entry, locale), m.slice(1)) + suffix;
  }
  return href;
}

/**
 * Adresse affichée (sans préfixe de langue) → adresse interne. Accepte aussi
 * l'adresse d'une autre langue (`/tarifs` lu en allemand) et l'adresse interne.
 */
export function internalPath(href: string, locale?: string): string {
  const [path, suffix] = splitSuffix(href);
  for (const entry of ENTRIES) {
    const templates = [
      ...(locale ? [templateFor(entry, locale)] : []),
      ...Object.values(entry.localized),
      entry.internal,
    ];
    for (const template of templates) {
      const m = path.match(matcher(template));
      if (m) return fill(entry.internal, m.slice(1)) + suffix;
    }
  }
  return href;
}

/** Pages des concerts de Gstaad : redirection temporaire (302) le temps du festival. */
const TEMPORARY = /^\/events\/gnymf-/;

/**
 * Ancienne adresse (interne, en anglais) demandée dans une langue qui a sa
 * propre adresse : où rediriger, et avec quel code. `null` si rien à faire.
 * `pathname` porte son éventuel préfixe de langue (`/de/pricing`).
 */
export function legacyRedirect(
  pathname: string,
  locales: readonly string[],
  defaultLocale: string,
): { pathname: string; status: 302 | 308 } | null {
  const prefix = pathname.match(/^\/([a-z]{2})(?=\/|$)/);
  const locale = prefix && locales.includes(prefix[1]) ? prefix[1] : defaultLocale;
  const rest = (prefix && locale === prefix[1] ? pathname.slice(3) : pathname) || "/";
  for (const entry of ENTRIES) {
    const m = rest.match(matcher(entry.internal));
    if (!m) continue;
    const target = fill(templateFor(entry, locale), m.slice(1));
    if (target === fill(entry.internal, m.slice(1))) return null;
    const localePrefix = locale === defaultLocale ? "" : `/${locale}`;
    return {
      pathname: `${localePrefix}${target}`,
      status: TEMPORARY.test(rest) ? 302 : 308,
    };
  }
  return null;
}

/** Forme attendue par le middleware de next-intl (toutes les langues renseignées). */
export function middlewarePathnames(locales: readonly Locale[]): Record<string, Record<Locale, string>> {
  return Object.fromEntries(
    ENTRIES.map((entry) => [
      entry.internal,
      Object.fromEntries(locales.map((l) => [l, templateFor(entry, l)])) as Record<Locale, string>,
    ]),
  );
}
