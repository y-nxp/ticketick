/**
 * Le mode « Entrée » de l'app de contrôle s'ouvre deux heures avant le début
 * de la séance. Avant, seul « Vérifier » est possible : un billet scanné trop
 * tôt n'est pas consommé et reste valable pour l'entrée.
 */
export const ENTRY_OPENS_BEFORE_MS = 2 * 60 * 60 * 1000;

/** Instant d'ouverture de l'entrée, en millisecondes. */
export function entryOpensAt(startsAt: string | Date): number {
  return new Date(startsAt).getTime() - ENTRY_OPENS_BEFORE_MS;
}

export function isEntryOpen(startsAt: string | Date, now: number = Date.now()): boolean {
  return now >= entryOpensAt(startsAt);
}
