import type { Metadata } from "next";
import { routing, type Locale } from "@/i18n/routing";
import { localizedPath, SITE_ORIGIN } from "@/lib/seo/event";

/** L'espagnol ne traduit que le parcours d'achat : les pages d'information n'existent qu'en quatre langues. */
export const SITE_LOCALES = routing.locales.filter((l) => l !== "es");

/**
 * Adresse canonique et variantes linguistiques d'une page, pour `generateMetadata`.
 * Une langue absente de `locales` renvoie à la version anglaise, celle qu'elle affiche.
 */
export function pageAlternates(
  path: string,
  locale: string,
  locales: readonly Locale[] = SITE_LOCALES,
): Metadata["alternates"] {
  const shown = (locales as readonly string[]).includes(locale) ? locale : "en";
  return {
    canonical: localizedPath(path, shown),
    languages: Object.fromEntries([
      ...locales.map((l) => [l, localizedPath(path, l)]),
      ["x-default", localizedPath(path, routing.defaultLocale)],
    ]),
  };
}

const OG_LOCALES: Record<string, string> = {
  fr: "fr_CH",
  en: "en_GB",
  de: "de_CH",
  it: "it_CH",
  es: "es_ES",
};

export function ogLocale(locale: string): string {
  return OG_LOCALES[locale] ?? OG_LOCALES.fr;
}

/**
 * Aperçu de partage (WhatsApp, LinkedIn…). Une page qui définit `openGraph`
 * remplace celui de la mise en page : elle repart de cette base.
 */
export function siteOpenGraph(
  locale: string,
  images?: string[],
): NonNullable<Metadata["openGraph"]> {
  return { siteName: "ticketick.ch", type: "website", locale: ogLocale(locale), ...(images ? { images } : {}) };
}

/** Données structurées de l'accueil : la plateforme et son site. */
export function siteJsonLd(locale: string, description: string): Record<string, unknown>[] {
  const organization = {
    "@type": "Organization",
    "@id": `${SITE_ORIGIN}/#organization`,
    name: "ticketick",
    url: SITE_ORIGIN,
    logo: `${SITE_ORIGIN}/brand/ticketick-icone-512.png`,
    email: "support@ticketick.ch",
    address: { "@type": "PostalAddress", addressLocality: "Lausanne", addressCountry: "CH" },
    areaServed: ["CH"],
  };
  const website = {
    "@type": "WebSite",
    "@id": `${SITE_ORIGIN}/#website`,
    name: "ticketick.ch",
    url: `${SITE_ORIGIN}${localizedPath("", locale)}`,
    description,
    inLanguage: locale,
    publisher: { "@id": organization["@id"] },
  };
  return [
    { "@context": "https://schema.org", ...organization },
    { "@context": "https://schema.org", ...website },
  ];
}
