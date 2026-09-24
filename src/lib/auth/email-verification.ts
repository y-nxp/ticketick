import "server-only";

import { createHash, randomBytes } from "node:crypto";
import {
  attachOrdersToUser,
  followOrganizersFromOrders,
} from "@/lib/account/guest-orders";
import { publicAppOrigin } from "@/lib/app-url";
import { sendEmailConfirmation } from "@/lib/email";
import { prisma } from "@/lib/prisma";

const DUREE_H = 48;

function empreinte(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Envoie un lien de confirmation ; les liens précédents restent valables. */
export async function sendVerificationLink(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, locale: true, emailVerifiedAt: true },
  });
  if (!user || user.emailVerifiedAt) return;

  const token = randomBytes(32).toString("base64url");
  await prisma.emailVerificationToken.create({
    data: {
      userId,
      tokenHash: empreinte(token),
      expiresAt: new Date(Date.now() + DUREE_H * 60 * 60 * 1000),
    },
  });

  const locale = user.locale || "fr";
  const prefix = locale === "fr" ? "" : `/${locale}`;
  await sendEmailConfirmation({
    to: user.email,
    name: user.name,
    locale,
    url: `${publicAppOrigin()}${prefix}/verify-email?token=${token}`,
    expiresInHours: DUREE_H,
  });
}

/**
 * Adresse désormais prouvée : les achats faits sans compte sous cette adresse
 * rejoignent l'espace, et le suivi des organisateurs s'applique s'il a été
 * accepté à l'inscription.
 */
export async function markEmailVerified(userId: string): Promise<void> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { emailVerifiedAt: new Date() },
    select: { email: true, marketingOptIn: true },
  });
  await attachOrdersToUser(userId, user.email);
  if (user.marketingOptIn) await followOrganizersFromOrders(userId);
}

/** Consomme un lien de confirmation ; `false` s'il est inconnu, expiré ou déjà servi. */
export async function confirmEmailToken(token: string): Promise<boolean> {
  if (!token) return false;
  const ligne = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: empreinte(token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });
  if (!ligne || ligne.expiresAt.getTime() <= Date.now()) return false;
  // Un lien déjà servi redit « confirmé » : les messageries qui ouvrent les
  // liens pour les analyser le consomment souvent avant la personne.
  if (ligne.usedAt) return true;

  const { count } = await prisma.emailVerificationToken.updateMany({
    where: { id: ligne.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (count === 1) await markEmailVerified(ligne.userId);
  return true;
}
