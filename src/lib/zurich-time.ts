/**
 * Heures suisses (Europe/Zurich) sans dépendre du fuseau du serveur, réglé
 * en UTC en production.
 */

export const ZURICH_TIME_ZONE = "Europe/Zurich";

/**
 * Convertit une heure locale suisse (« 2026-11-04T20:00 ») en instant absolu.
 *
 * Le décalage varie selon l'heure d'été : il est mesuré à la date visée plutôt
 * que supposé constant, faute de quoi les séances d'hiver seraient décalées
 * d'une heure.
 */
export function zurichToUtc(local: string): Date {
  const presume = new Date(`${local.slice(0, 16)}:00Z`);
  const offset = zurichOffsetMs(presume);
  // Deuxième passe : près d'un changement d'heure, le décalage retenu peut
  // être celui de l'autre côté de la bascule.
  return new Date(
    presume.getTime() - zurichOffsetMs(new Date(presume.getTime() - offset)),
  );
}

function zurichOffsetMs(instant: Date): number {
  const zurich = new Date(
    instant.toLocaleString("en-US", { timeZone: ZURICH_TIME_ZONE }),
  );
  const utc = new Date(instant.toLocaleString("en-US", { timeZone: "UTC" }));
  return zurich.getTime() - utc.getTime();
}

/** Instant affiché en heure suisse : « 2026-11-04T20:00 ». */
export function toZurichLocal(instant: Date): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: ZURICH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
  return parts.replace(" ", "T");
}
