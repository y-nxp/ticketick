import type { UserRole } from "@prisma/client";

/**
 * Qui peut faire quoi dans le module (docs/module-promotion.md, § 2.1),
 * en fonction pure : les actions serveur s'appuient d'abord sur
 * `catalogActor()` / `statsActor()` et `forbidIfForeignEvent`
 * (`src/lib/admin/access.ts`), puis vérifient ici que l'événement, le compte
 * social et la publication relèvent bien de l'organisateur de l'acteur.
 *
 * | Rôle              | Composer / programmer        | Lire              |
 * |-------------------|------------------------------|-------------------|
 * | ADMIN             | tout organisateur            | tout              |
 * | ORGANIZER         | ses événements seulement     | les siens         |
 * | ORGANIZER_VIEWER  | non                          | son organisateur  |
 * | autres rôles      | non                          | non               |
 *
 * L'admin qui consulte un compte agit sous le rôle de ce compte : il compose
 * donc comme l'organisateur, ce que le tableau du § 2.1 autorise. Seule la
 * connexion d'un compte social lui sera refusée (carte OAuth).
 */

export interface PromotionActor {
  role: UserRole;
  organizerId: string | null;
  statsOrganizerId: string | null;
}

export interface PromotionScope {
  read: boolean;
  write: boolean;
  /** Organisateur visé ; `null` avec `read` : tous (admin). */
  organizerId: string | null;
}

const NONE: PromotionScope = { read: false, write: false, organizerId: null };

export function promotionScope(actor: PromotionActor): PromotionScope {
  switch (actor.role) {
    case "ADMIN":
      return { read: true, write: true, organizerId: null };
    case "ORGANIZER":
      return actor.organizerId ? { read: true, write: true, organizerId: actor.organizerId } : NONE;
    case "ORGANIZER_VIEWER":
      return actor.statsOrganizerId
        ? { read: true, write: false, organizerId: actor.statsOrganizerId }
        : NONE;
    default:
      return NONE;
  }
}

function covers(scope: PromotionScope, organizerId: string): boolean {
  return scope.organizerId === null || scope.organizerId === organizerId;
}

/** Voir les publications et campagnes de cet organisateur. */
export function mayReadPromotion(actor: PromotionActor, organizerId: string): boolean {
  const scope = promotionScope(actor);
  return scope.read && covers(scope, organizerId);
}

/** Composer, programmer, modifier ou annuler pour cet organisateur. */
export function mayWritePromotion(actor: PromotionActor, organizerId: string): boolean {
  const scope = promotionScope(actor);
  return scope.write && covers(scope, organizerId);
}
