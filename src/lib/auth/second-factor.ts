import "server-only";

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { UserRole } from "@prisma/client";
import { sendLoginCodeEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { readChallengeId, setChallengeCookie } from "./session";

/**
 * Code de connexion reçu par courriel.
 *
 * Exigé des comptes qui ouvrent le backoffice ou encaissent de l'argent : un
 * mot de passe deviné ou réutilisé ailleurs ne suffit plus à y entrer. Les
 * acheteurs et les contrôleurs d'entrée n'y sont pas soumis.
 */

const PROTECTED: readonly UserRole[] = ["ADMIN", "ORGANIZER", "ORGANIZER_VIEWER", "RESELLER_AGENT"];

export const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const MAX_SENDS = 4;
const RESEND_AFTER_MS = 30 * 1000;
/** Demandes ouvertes par compte sur 15 minutes : borne les courriels qu'un mot de passe volé peut déclencher. */
const MAX_CHALLENGES = { count: 6, windowMs: 15 * 60 * 1000 };

export function needsSecondFactor(role: UserRole): boolean {
  return PROTECTED.includes(role);
}

function hashCode(challengeId: string, code: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET absent : impossible de protéger les codes de connexion.");
  return createHmac("sha256", secret).update(`${challengeId}:${code}`).digest("hex");
}

function newCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

async function sendCode(challengeId: string, code: string): Promise<void> {
  const challenge = await prisma.loginChallenge.findUniqueOrThrow({
    where: { id: challengeId },
    select: { user: { select: { email: true, name: true, locale: true } } },
  });
  await sendLoginCodeEmail({
    to: challenge.user.email,
    name: challenge.user.name,
    locale: challenge.user.locale || "fr",
    code,
    expiresInMinutes: CODE_MINUTES,
  });
}

/** Ouvre une demande, envoie le code et dépose le cookie ; `false` si trop de demandes récentes. */
export async function startChallenge(userId: string, next: string | null): Promise<boolean> {
  const recent = await prisma.loginChallenge.count({
    where: { userId, createdAt: { gt: new Date(Date.now() - MAX_CHALLENGES.windowMs) } },
  });
  if (recent >= MAX_CHALLENGES.count) return false;

  // Une seule demande vivante par compte : l'ancien code ne doit plus servir.
  await prisma.loginChallenge.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });

  const code = newCode();
  const expiresAt = new Date(Date.now() + CODE_MINUTES * 60 * 1000);
  const challenge = await prisma.loginChallenge.create({
    data: { userId, codeHash: "", expiresAt, next },
    select: { id: true },
  });
  await prisma.loginChallenge.update({
    where: { id: challenge.id },
    data: { codeHash: hashCode(challenge.id, code) },
  });
  await setChallengeCookie(challenge.id, expiresAt);
  await sendCode(challenge.id, code);
  return true;
}

type LiveChallenge = {
  id: string;
  userId: string;
  codeHash: string;
  attempts: number;
  sends: number;
  sentAt: Date;
  next: string | null;
  user: { email: string; role: UserRole; active: boolean };
};

/** Demande du navigateur, si elle est encore utilisable. */
export async function currentChallenge(): Promise<LiveChallenge | null> {
  const id = await readChallengeId();
  if (!id) return null;
  const challenge = await prisma.loginChallenge.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      codeHash: true,
      attempts: true,
      sends: true,
      sentAt: true,
      next: true,
      expiresAt: true,
      usedAt: true,
      user: { select: { email: true, role: true, active: true } },
    },
  });
  if (!challenge || challenge.usedAt || challenge.expiresAt.getTime() <= Date.now()) return null;
  if (!challenge.user.active) return null;
  return challenge;
}

export type CheckResult =
  | { ok: true; userId: string; role: UserRole; next: string | null }
  | { ok: false; error: "wrong" | "expired" };

/** Vérifie le code saisi ; la demande se clôt au succès comme après trop d'erreurs. */
export async function checkCode(input: string): Promise<CheckResult> {
  const challenge = await currentChallenge();
  if (!challenge) return { ok: false, error: "expired" };

  const code = input.replace(/\D/g, "");
  const expected = Buffer.from(challenge.codeHash, "hex");
  const given = Buffer.from(hashCode(challenge.id, code), "hex");
  const matches = code.length === 6 && expected.length === given.length && timingSafeEqual(expected, given);

  if (!matches) {
    const attempts = challenge.attempts + 1;
    await prisma.loginChallenge.update({
      where: { id: challenge.id },
      data: { attempts, usedAt: attempts >= MAX_ATTEMPTS ? new Date() : undefined },
    });
    return { ok: false, error: attempts >= MAX_ATTEMPTS ? "expired" : "wrong" };
  }

  // Condition sur `usedAt` : deux envois simultanés du même code n'ouvrent qu'une session.
  const { count } = await prisma.loginChallenge.updateMany({
    where: { id: challenge.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (count !== 1) return { ok: false, error: "expired" };
  return { ok: true, userId: challenge.userId, role: challenge.user.role, next: challenge.next };
}

export type ResendResult = "sent" | "wait" | "limit" | "expired";

/** Nouveau code pour la même demande, qui repart pour sa durée complète. */
export async function resendCode(): Promise<ResendResult> {
  const challenge = await currentChallenge();
  if (!challenge) return "expired";
  if (challenge.sends >= MAX_SENDS) return "limit";
  if (Date.now() - challenge.sentAt.getTime() < RESEND_AFTER_MS) return "wait";

  const code = newCode();
  const expiresAt = new Date(Date.now() + CODE_MINUTES * 60 * 1000);
  await prisma.loginChallenge.update({
    where: { id: challenge.id },
    data: {
      codeHash: hashCode(challenge.id, code),
      expiresAt,
      sends: { increment: 1 },
      sentAt: new Date(),
    },
  });
  await setChallengeCookie(challenge.id, expiresAt);
  await sendCode(challenge.id, code);
  return "sent";
}

/** Abandonne la demande en cours (« utiliser un autre compte »). */
export async function cancelChallenge(): Promise<void> {
  const id = await readChallengeId();
  if (id) {
    await prisma.loginChallenge.updateMany({ where: { id, usedAt: null }, data: { usedAt: new Date() } });
  }
}
