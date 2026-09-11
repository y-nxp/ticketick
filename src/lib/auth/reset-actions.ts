"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import bcrypt from "bcryptjs";
import { redirect } from "@/i18n/navigation";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/email";
import { createSession, destroyAllSessions } from "./session";

/**
 * Réinitialisation de mot de passe par courriel.
 *
 * Le jeton en clair ne vit que dans le lien envoyé : la base n'en garde que
 * l'empreinte. Une copie de la base ne permet donc pas de s'emparer d'un
 * compte dont une demande est en cours.
 */

const DUREE_MS = 60 * 60 * 1000; // une heure
const MIN_LONGUEUR = 12;

export type DemandeState = { ok: true } | { error: string } | undefined;
// Pas de variante « ok » : la réussite se traduit par une redirection, jamais
// par un retour au formulaire.
export type ResetState = { error: string } | undefined;

function empreinte(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "inconnue"
  );
}

// Limitation en mémoire, comme pour la connexion : suffisant pour une seule
// instance, à remplacer par un magasin partagé le jour où l'application est
// répliquée.
const tentatives = new Map<string, { n: number; jusqu: number }>();

function trop(cle: string, max: number): boolean {
  const maintenant = Date.now();
  const suivi = tentatives.get(cle);
  if (!suivi || suivi.jusqu < maintenant) return false;
  return suivi.n >= max;
}

function compter(cle: string, fenetreMs: number) {
  const maintenant = Date.now();
  const suivi = tentatives.get(cle);
  if (!suivi || suivi.jusqu < maintenant) {
    tentatives.set(cle, { n: 1, jusqu: maintenant + fenetreMs });
    return;
  }
  suivi.n += 1;
}

/**
 * Demande d'un lien de réinitialisation.
 *
 * La réponse est la même que le compte existe ou non : distinguer les deux
 * transformerait ce formulaire en outil d'énumération d'adresses.
 */
export async function requestPasswordReset(
  _state: DemandeState,
  data: FormData,
): Promise<DemandeState> {
  const brut = data.get("email");
  const email = typeof brut === "string" ? brut.trim().toLowerCase() : "";

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "invalidEmail" };
  }

  const ip = await clientIp();
  const fenetre = 15 * 60 * 1000;
  // Compter aussi par adresse visée : sans cela, un envoi répété permettrait
  // de harceler une boîte depuis plusieurs origines.
  const cles = [`ip:${ip}`, `mail:${email}`];
  if (cles.some((c) => trop(c, 5))) return { error: "throttled" };
  cles.forEach((c) => compter(c, fenetre));

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, active: true, name: true, locale: true },
    });

    // Un compte désactivé ne reçoit pas de lien : le réactiver relève de
    // l'administration, pas d'une demande venue de l'extérieur.
    if (user && user.active) {
      const token = randomBytes(32).toString("base64url");

      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: empreinte(token),
          expiresAt: new Date(Date.now() + DUREE_MS),
        },
      });

      const locale = user.locale ?? (await getLocale());
      const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://ticketick.ch";

      await sendPasswordResetEmail({
        to: email,
        name: user.name,
        locale,
        url: `${base}/${locale}/reset-password?token=${token}`,
        expiresInMinutes: DUREE_MS / 60000,
      });
    }

    return { ok: true };
  } catch (error) {
    // Journalisé : sans cette trace, une panne d'envoi passerait pour un
    // succès côté visiteur, qui attendrait un courriel qui n'arrive jamais.
    console.error("[auth] demande de réinitialisation impossible", error);
    return { error: "unavailable" };
  }
}

/**
 * Vérifie un jeton sans le consommer, pour décider si le formulaire doit
 * s'afficher. Ne dit rien de plus que « utilisable ou non ».
 */
export async function resetTokenUsable(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    const ligne = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: empreinte(token) },
      select: { expiresAt: true, usedAt: true },
    });
    if (!ligne || ligne.usedAt) return false;
    return ligne.expiresAt.getTime() > Date.now();
  } catch (error) {
    console.error("[auth] lecture du jeton impossible", error);
    return false;
  }
}

/** Fixe le nouveau mot de passe et ouvre une session. */
export async function resetPassword(
  _state: ResetState,
  data: FormData,
): Promise<ResetState> {
  const token = typeof data.get("token") === "string" ? String(data.get("token")) : "";
  const next = data.get("next");
  const confirm = data.get("confirm");

  if (typeof next !== "string" || typeof confirm !== "string") {
    return { error: "invalid" };
  }
  if (next.length < MIN_LONGUEUR) return { error: "tooShort" };
  if (next !== confirm) return { error: "mismatch" };

  const locale = await getLocale();
  const ip = await clientIp();
  const cle = `reset:${ip}`;
  if (trop(cle, 10)) return { error: "throttled" };
  compter(cle, 15 * 60 * 1000);

  try {
    const ligne = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: empreinte(token) },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });

    if (!ligne || ligne.usedAt || ligne.expiresAt.getTime() <= Date.now()) {
      return { error: "tokenInvalid" };
    }

    const passwordHash = await bcrypt.hash(next, 12);

    // Marquage et changement dans la même transaction, avec une condition sur
    // `usedAt` : deux requêtes simultanées portant le même lien ne doivent pas
    // aboutir toutes les deux.
    const consomme = await prisma.$transaction(async (tx) => {
      const { count } = await tx.passwordResetToken.updateMany({
        where: { id: ligne.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (count !== 1) return false;

      await tx.user.update({
        where: { id: ligne.userId },
        data: { passwordHash },
      });
      return true;
    });

    if (!consomme) return { error: "tokenInvalid" };

    // Les autres liens en attente tombent : une demande plus ancienne restée
    // dans une boîte ne doit pas rouvrir l'accès après coup.
    await prisma.passwordResetToken.updateMany({
      where: { userId: ligne.userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    // Toutes les sessions ouvertes tombent également : si le compte était
    // compromis, l'intrus ne doit pas survivre au changement. Une nouvelle est
    // ouverte pour la personne qui vient de le faire.
    await destroyAllSessions(ligne.userId);
    await createSession(ligne.userId);
  } catch (error) {
    console.error("[auth] réinitialisation impossible", error);
    return { error: "unavailable" };
  }

  // Redirection côté serveur, hors du `try` : `redirect` s'exprime par une
  // exception, qui serait sinon prise pour une panne. Rendre la main au
  // formulaire ferait réafficher la page, dont le jeton vient d'être consommé,
  // sous son visage « lien expiré » — un échec annoncé après une réussite.
  redirect({ href: "/account", locale });
}
