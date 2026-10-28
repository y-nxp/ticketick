import type { UserRole } from "@prisma/client";

/**
 * Affichage des entrées du module Promotion : menu « Promotion », section
 * « Promouvoir » de la fiche événement, action « Promouvoir » de la liste.
 *
 * ADMIN seulement, volontairement : tant que la connexion des comptes
 * Facebook / Instagram (OAuth) n'existe pas, un organisateur verrait une
 * fonction inutilisable. À LEVER À L'OUVERTURE AUX ORGANISATEURS — par
 * exemple `role === "ADMIN" || role === "ORGANIZER" || role === "ORGANIZER_VIEWER"`,
 * comme le prévoit docs/module-promotion.md, § 2.2.
 *
 * Ce n'est qu'un affichage : les pages `/admin/promotion/*` et les actions
 * serveur ne s'en servent pas. Elles appliquent les droits du § 2.1 à tous les
 * rôles (`catalogActor`, `statsActor`, `forbidIfForeignEvent`,
 * `src/lib/promotion/access.ts`).
 */
export function canSeePromotionUi(user: { role: UserRole } | null | undefined): boolean {
  return user?.role === "ADMIN";
}
