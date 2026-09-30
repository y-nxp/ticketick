import { defineRouting } from "next-intl/routing";

export const locales = ["fr", "en", "de", "it", "es"] as const;
export type Locale = (typeof locales)[number];

/**
 * L'espagnol couvre le parcours d'achat (spectacles, panier, paiement,
 * courriels, billets). Le reste s'affiche en anglais pour ces visiteurs.
 */
export const localeLabels: Record<Locale, string> = {
  fr: "Français",
  en: "English",
  de: "Deutsch",
  it: "Italiano",
  es: "Español",
};

export const routing = defineRouting({
  locales,
  defaultLocale: "fr",
  localePrefix: "as-needed",
});
