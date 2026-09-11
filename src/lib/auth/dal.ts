import "server-only";

import { cache } from "react";
import { getLocale } from "next-intl/server";
import type { UserRole } from "@prisma/client";
// Redirection consciente de la langue : `next/navigation` renverrait un
// visiteur germanophone sur la version française de la page de connexion.
import { redirect } from "@/i18n/navigation";
import { prisma } from "@/lib/prisma";
import { currentSessionToken, readSessionId } from "./session";

/**
 * Couche d'autorisation.
 *
 * Toute vérification passe par ici, au plus près de la donnée. La
 * documentation de Next.js est explicite sur ce point : un layout ne décide
 * pas du rendu des segments qu'il contient, si bien qu'un contrôle placé dans
 * un layout n'empêche ni les pages ni les actions serveur de s'exécuter. Les
 * pages, les actions et les gestionnaires de route doivent donc appeler eux-
 * mêmes `requireRole` ou `requireAuth`.
 *
 * `cache` mémorise le résultat le temps d'un rendu : plusieurs composants
 * peuvent interroger l'utilisateur courant sans multiplier les requêtes.
 */

/** Ce qu'on accepte d'exposer d'un utilisateur connecté. */
export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  locale: string;
}

/**
 * Utilisateur de la requête en cours, ou `null`.
 *
 * Ne redirige pas : sert aussi aux affichages qui s'adaptent selon qu'on est
 * connecté ou non, comme l'en-tête.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const sessionId = await readSessionId(await currentSessionToken());
  if (!sessionId) return null;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      expiresAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          locale: true,
          active: true,
        },
      },
    },
  });

  if (!session) return null;

  // La signature du cookie porte déjà une échéance, mais celle enregistrée
  // fait foi : elle seule permet d'écourter une session côté serveur.
  if (session.expiresAt.getTime() <= Date.now()) return null;

  // Un compte désactivé perd l'accès immédiatement, sans attendre que ses
  // sessions expirent.
  if (!session.user.active) return null;

  // Champs listés un à un : ce qui sort d'ici peut remonter jusqu'à un
  // composant client, et rien ne doit s'y ajouter par inadvertance.
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    locale: session.user.locale,
  };
});

/** Utilisateur connecté, ou redirection vers la page de connexion. */
export async function requireAuth(returnTo?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) return redirectToLogin(returnTo);
  return user;
}

/**
 * Exige l'un des rôles indiqués.
 *
 * Un visiteur non connecté est envoyé se connecter ; un utilisateur connecté
 * mais sans le droit requis reçoit une page « accès refusé » plutôt qu'une
 * redirection vers la connexion, qui laisserait croire à une session perdue.
 */
export async function requireRole(
  roles: UserRole | UserRole[],
  returnTo?: string,
): Promise<CurrentUser> {
  const allowed = Array.isArray(roles) ? roles : [roles];
  const user = await getCurrentUser();

  if (!user) return redirectToLogin(returnTo);
  if (!allowed.includes(user.role)) {
    return redirect({ href: "/forbidden", locale: await getLocale() });
  }

  return user;
}

/** Raccourci pour le backoffice, dont l'accès est réservé aux administrateurs. */
export async function requireAdmin(returnTo?: string): Promise<CurrentUser> {
  return requireRole("ADMIN", returnTo);
}

/**
 * `redirect` lève une exception et son type de retour est `never`, mais
 * TypeScript ne l'exploite que sur une déclaration explicitement annotée : ici
 * il provient d'une déstructuration de `createNavigation`. Le `return` rend
 * donc l'interruption visible pour l'analyse de flot.
 */
async function redirectToLogin(returnTo?: string): Promise<never> {
  const href = returnTo
    ? `/login?next=${encodeURIComponent(returnTo)}`
    : "/login";
  return redirect({ href, locale: await getLocale() });
}
