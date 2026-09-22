import "server-only";

import {
  releaseStaleUnpaidCardOrders,
  STALE_RELEASE_BATCH,
} from "./create-order";

/** Le délai de rétention est de 25 min : balayer toutes les 5 min suffit. */
const INTERVALLE_MS = 5 * 60 * 1000;
/** Laisse la base répondre avant la première passe. */
const DEMARRAGE_MS = 15 * 1000;
/** Chaque passe traite `STALE_RELEASE_BATCH` commandes au plus. */
const PASSES_MAX = 10;

let demarre = false;
let enCours = false;

async function balayer(): Promise<void> {
  if (enCours) return;
  enCours = true;
  try {
    for (let passe = 0; passe < PASSES_MAX; passe += 1) {
      const rendues = await releaseStaleUnpaidCardOrders();
      if (rendues === 0) return;
      console.log(`[rétentions] ${rendues} panier(s) abandonné(s) libéré(s)`);
      if (rendues < STALE_RELEASE_BATCH) return;
    }
  } catch (error) {
    console.error("[rétentions] balayage impossible", error);
  } finally {
    enCours = false;
  }
}

/**
 * Libère les paniers abandonnés sans attendre le prochain visiteur.
 *
 * `releaseStaleUnpaidCardOrders` n'était appelée qu'au fil du trafic : sur un
 * événement calme, une tentative pouvait retenir des places pendant des jours
 * et rester affichée « Paiement attendu » dans le back-office.
 */
export function startHoldJanitor(): void {
  if (demarre) return;
  demarre = true;
  setTimeout(() => void balayer(), DEMARRAGE_MS).unref();
  setInterval(() => void balayer(), INTERVALLE_MS).unref();
}
