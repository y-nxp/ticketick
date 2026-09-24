import "server-only";

/**
 * Compteur par clé sur une fenêtre fixe, en mémoire du processus.
 *
 * Suffit tant que l'application tourne en une seule instance ; au-delà, il
 * faudrait un stockage partagé pour que la limite reste globale.
 */

const fenetres = new Map<string, { n: number; jusqu: number }>();
let prochainMenage = 0;

/** Compte un passage ; `false` si la clé a déjà atteint `max` sur la fenêtre. */
export function consume(key: string, max: number, windowMs: number): boolean {
  const maintenant = Date.now();
  if (maintenant > prochainMenage) {
    for (const [cle, suivi] of fenetres) {
      if (suivi.jusqu < maintenant) fenetres.delete(cle);
    }
    prochainMenage = maintenant + 60_000;
  }

  const suivi = fenetres.get(key);
  if (!suivi || suivi.jusqu < maintenant) {
    fenetres.set(key, { n: 1, jusqu: maintenant + windowMs });
    return true;
  }
  if (suivi.n >= max) return false;
  suivi.n += 1;
  return true;
}

/**
 * Adresse du visiteur derrière Cloudflare puis Nginx Proxy Manager.
 *
 * `cf-connecting-ip` est posé par Cloudflare, qui écrase toute valeur reçue ;
 * `x-real-ip` n'y verrait qu'un nœud Cloudflare, et le premier élément de
 * `x-forwarded-for` est fourni tel quel par le client.
 */
export function clientIpFrom(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    "inconnue"
  );
}
