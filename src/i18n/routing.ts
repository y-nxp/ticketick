import { defineRouting } from "next-intl/routing";

export const locales = ["fr", "en", "de", "it"] as const;
export type Locale = (typeof locales)[number];

export const localeLabels: Record<Locale, string> = {
  fr: "Français",
  en: "English",
  de: "Deutsch",
  it: "Italiano",
};

export const routing = defineRouting({
  locales,
  defaultLocale: "fr",
  localePrefix: "as-needed",
});
