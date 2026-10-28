import type { SocialProvider } from "@prisma/client";

/**
 * Débit par compte (docs/module-promotion.md, §§ 4.1 et 8) : Instagram
 * n'accepte que 50 publications par l'API par 24 h et par compte
 * **[Meta 28.10.2026]**. La minuterie compte, avant de réserver, ce qui est
 * parti (ou en cours) sur ce compte dans les dernières 24 h glissantes ; au
 * 51ᵉ, elle reporte la publication à l'instant où une place se libère.
 *
 * Facebook n'a pas de limite connue de ce genre : pas de compteur. La limite
 * interne par organisateur (décision ouverte n° 3, § 9) n'est pas ici.
 */

/** Fait Meta vérifié le 28.10.2026 (§ 4.1). */
export const INSTAGRAM_POSTS_PER_WINDOW = 50;
export const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;

const LIMITS: Partial<Record<SocialProvider, number>> = {
  INSTAGRAM_BUSINESS: INSTAGRAM_POSTS_PER_WINDOW,
};

/** Plafond du fournisseur sur la fenêtre, ou `null` s'il n'y en a pas. */
export function postsPerWindow(provider: SocialProvider): number | null {
  return LIMITS[provider] ?? null;
}

/** Début de la fenêtre glissante : ce qui est plus récent compte. */
export function rateWindowStart(now: Date): Date {
  return new Date(now.getTime() - RATE_WINDOW_MS);
}

export type RateDecision = { ok: true } | { ok: false; retryAt: Date; count: number; limit: number };

/**
 * Une publication de plus sur ce compte est-elle permise maintenant ?
 * `recent` : heures de publication (ou de réservation, pour une publication
 * en cours) sur ce compte ; celles hors fenêtre sont ignorées.
 */
export function rateDecision(provider: SocialProvider, recent: Date[], now: Date): RateDecision {
  const limit = postsPerWindow(provider);
  if (limit === null) return { ok: true };
  const start = rateWindowStart(now).getTime();
  const inWindow = recent
    .map((d) => d.getTime())
    .filter((t) => t > start)
    .sort((a, b) => a - b);
  if (inWindow.length < limit) return { ok: true };
  // Il en reste `limit - 1` quand la (n - limit + 1)ᵉ plus ancienne sort.
  const release = inWindow[inWindow.length - limit]! + RATE_WINDOW_MS;
  return { ok: false, retryAt: new Date(release), count: inWindow.length, limit };
}
