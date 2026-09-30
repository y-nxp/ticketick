/**
 * Dictionnaires côté serveur (courriels, billets, paiement), hors next-intl.
 * L'espagnol ne couvre que le parcours d'achat : ailleurs il retombe sur
 * l'anglais, et toute langue inconnue sur le français.
 */
export function byLocale<T>(dict: Partial<Record<string, T>>, locale: string): T {
  return (dict[locale] ?? (locale === "es" ? dict.en : undefined) ?? dict.fr) as T;
}

/** Formatage des dates des libellés de paiement. */
export function intlLocale(locale: string): string {
  switch (locale) {
    case "en":
      return "en-CH";
    case "de":
      return "de-CH";
    case "it":
      return "it-CH";
    case "es":
      return "es-ES";
    default:
      return "fr-CH";
  }
}
