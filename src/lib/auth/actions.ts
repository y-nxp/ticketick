"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import * as z from "zod";
import { redirect } from "@/i18n/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession } from "./session";

/**
 * Actions d'authentification.
 *
 * Traitées comme des points d'entrée publics : tout ce qui arrive ici vient du
 * réseau et doit être validé, quelles que soient les contraintes posées côté
 * navigateur.
 */

const LoginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1),
});

export interface LoginState {
  error?: "invalid" | "throttled" | "unavailable";
}

/**
 * Limitation des tentatives, par adresse IP et par compte visé.
 *
 * Compter aussi par compte est nécessaire : un attaquant réparti sur plusieurs
 * adresses contournerait sans peine une limite posée sur la seule IP.
 */
const ATTEMPTS = { max: 8, windowMs: 15 * 60 * 1000 };
const attempts = new Map<string, number[]>();

function tooManyAttempts(keys: string[]): boolean {
  const now = Date.now();
  return keys.some((key) => {
    const recent = (attempts.get(key) ?? []).filter(
      (t) => now - t < ATTEMPTS.windowMs,
    );
    attempts.set(key, recent);
    return recent.length >= ATTEMPTS.max;
  });
}

function recordAttempt(keys: string[]): void {
  const now = Date.now();
  for (const key of keys) {
    attempts.set(key, [...(attempts.get(key) ?? []), now]);
  }
}

function clearAttempts(keys: string[]): void {
  for (const key of keys) attempts.delete(key);
}

/**
 * Empreinte d'un mot de passe qui n'appartient à personne.
 *
 * Comparée lorsque le compte n'existe pas, pour que la réponse prenne le même
 * temps que sur un compte réel : sans cela, la durée de traitement révélerait
 * quelles adresses sont enregistrées.
 */
const ABSENT_ACCOUNT_HASH = bcrypt.hashSync("mot-de-passe-sans-compte", 12);

export async function login(
  _state: LoginState | undefined,
  formData: FormData,
): Promise<LoginState> {
  const locale = await getLocale();
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  // Le message reste le même que pour un mot de passe erroné : distinguer les
  // deux cas indiquerait quelles adresses existent.
  if (!parsed.success) return { error: "invalid" };

  const { email, password } = parsed.data;
  const ip = await clientIp();
  const keys = [`ip:${ip}`, `compte:${email}`];

  if (tooManyAttempts(keys)) return { error: "throttled" };

  let user;
  try {
    user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, active: true },
    });
  } catch (error) {
    // Journalisé sans détour : la panne se voit côté visiteur comme un
    // « service indisponible », message identique pour tous et qui ne révèle
    // donc rien, mais qui masquerait aussi bien une base injoignable qu'une
    // requête fautive. Sans cette trace, la seconde resterait invisible.
    console.error("[auth] lecture du compte impossible", error);
    // Ce n'est pas un échec d'authentification, et le dire évite à
    // l'utilisateur de croire qu'il se trompe de mot de passe.
    return { error: "unavailable" };
  }

  const hash = user?.passwordHash ?? ABSENT_ACCOUNT_HASH;
  const passwordMatches = await bcrypt.compare(password, hash);

  // La comparaison est faite dans tous les cas, y compris compte absent,
  // inactif ou sans mot de passe, avant d'en tirer la moindre conclusion.
  if (!user || !user.passwordHash || !user.active || !passwordMatches) {
    recordAttempt(keys);
    return { error: "invalid" };
  }

  clearAttempts(keys);

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await createSession(user.id);

  // `return` nécessaire pour que l'analyse de flot voie l'interruption : le
  // type `never` de `redirect` n'est pas exploité sur un identifiant issu
  // d'une déstructuration.
  return redirect({ href: safeNext(formData.get("next")), locale });
}

export async function logout(): Promise<void> {
  const locale = await getLocale();
  await destroySession();
  redirect({ href: "/", locale });
}

/**
 * N'accepte qu'un chemin interne.
 *
 * `next` vient du réseau : sans ce filtre, un lien forgé renverrait la
 * personne sur un site tiers juste après sa connexion, au moment précis où
 * elle s'attend le moins à changer de domaine.
 */
function safeNext(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "/";
  // « // » et « /\ » sont interprétés comme des adresses absolues.
  if (!value.startsWith("/") || /^\/[/\\]/.test(value)) return "/";
  return value;
}

async function clientIp(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "inconnue";
  return headerList.get("x-real-ip") ?? "inconnue";
}
