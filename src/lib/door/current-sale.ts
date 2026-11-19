/** La caisse reste sur un concert jusqu'à deux heures après son début. */
export const CURRENT_UNTIL_MS = 2 * 60 * 60 * 1000;

/**
 * Concert ouvert d'office à la caisse : le premier (dans l'ordre des dates)
 * qui n'a pas commencé il y a plus de deux heures. Le précédent cède ainsi la
 * place au suivant.
 */
export function currentSaleSession<T extends { startsAt: Date }>(sessions: T[], now = new Date()): T | null {
  return sessions.find((s) => s.startsAt.getTime() > now.getTime() - CURRENT_UNTIL_MS) ?? null;
}
