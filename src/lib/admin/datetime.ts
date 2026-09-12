/**
 * Conversion d'un instant absolu vers un champ `datetime-local` en heure suisse.
 *
 * Module volontairement sans `server-only` : les formulaires client préremplissent
 * les champs avec cette valeur. L'interprétation inverse (saisie → UTC) reste
 * côté serveur, dans `form.ts`, pour ne pas dépendre du fuseau du navigateur.
 */
export function toZurichInput(date: Date | string | null | undefined): string {
  if (!date) return "";
  // Passé à un composant client, un Date devient une chaîne ISO : sans cette
  // conversion le champ datetime-local resterait vide, ou lèverait.
  const instant = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(instant.getTime())) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instant);
  // « sv-SE » produit « 2026-11-04 20:00 » : le séparateur attendu est un T.
  return parts.replace(" ", "T");
}
