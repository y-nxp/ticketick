"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import * as z from "zod";
import { redirect } from "@/i18n/navigation";
import { prisma } from "@/lib/prisma";
import { clientIpFrom } from "@/lib/rate-limit";
import {
  cancelChallenge,
  checkCode,
  needsSecondFactor,
  resendCode,
  startChallenge,
} from "./second-factor";
import { clearChallengeCookie, createSession, destroySession } from "./session";

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

function tooManyAttempts(keys: string[], limit = ATTEMPTS): boolean {
  const now = Date.now();
  return keys.some((key) => {
    const recent = (attempts.get(key) ?? []).filter(
      (t) => now - t < limit.windowMs,
    );
    attempts.set(key, recent);
    return recent.length >= limit.max;
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
      select: { id: true, passwordHash: true, active: true, role: true },
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
  // Même message qu'un mot de passe faux, pour ne pas révéler qu'un compte
  // existe à cette adresse.
  if (!user || !user.passwordHash || !user.active || !passwordMatches) {
    recordAttempt(keys);
    return { error: "invalid" };
  }

  clearAttempts(keys);

  if (needsSecondFactor(user.role)) {
    const next = safeNext(formData.get("next"));
    try {
      if (!(await startChallenge(user.id, next === "/" ? null : next))) {
        return { error: "throttled" };
      }
    } catch (error) {
      console.error("[auth] envoi du code de connexion impossible", error);
      return { error: "unavailable" };
    }
    // La page de connexion lit le cookie de la demande et affiche la saisie du code.
    return redirect({ href: "/login", locale });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await createSession(user.id);

  // `return` nécessaire pour que l'analyse de flot voie l'interruption : le
  // type `never` de `redirect` n'est pas exploité sur un identifiant issu
  // d'une déstructuration.
  return redirect({ href: afterLoginHref(user.role, formData.get("next")), locale });
}

export interface CodeState {
  error?: "wrong" | "expired" | "throttled" | "unavailable";
  resent?: "sent" | "wait" | "limit";
  /** Horodatage de la réponse : le formulaire n'affiche que la plus récente. */
  at?: number;
}

/**
 * Plus large que pour le mot de passe : la limite qui protège le code est
 * celle de chaque demande (cinq essais), celle-ci ne freine qu'un balayage.
 */
const CODE_ATTEMPTS = { max: 20, windowMs: 15 * 60 * 1000 };

/** Deuxième étape : le code reçu par courriel ouvre la session. */
export async function verifyLoginCode(
  _state: CodeState | undefined,
  formData: FormData,
): Promise<CodeState> {
  const locale = await getLocale();
  const at = Date.now();
  const ipKey = [`code-ip:${await clientIp()}`];
  if (tooManyAttempts(ipKey, CODE_ATTEMPTS)) return { error: "throttled", at };

  const code = formData.get("code");
  let result;
  try {
    result = await checkCode(typeof code === "string" ? code : "");
  } catch (error) {
    console.error("[auth] vérification du code impossible", error);
    return { error: "unavailable", at };
  }
  if (!result.ok) {
    recordAttempt(ipKey);
    if (result.error === "expired") await clearChallengeCookie();
    return { error: result.error, at };
  }

  await clearChallengeCookie();
  await prisma.user.update({ where: { id: result.userId }, data: { lastLoginAt: new Date() } });
  await createSession(result.userId, { secondFactor: true });
  return redirect({ href: afterLoginHref(result.role, result.next), locale });
}

export async function resendLoginCode(): Promise<CodeState> {
  const at = Date.now();
  try {
    const result = await resendCode();
    if (result === "expired") {
      await clearChallengeCookie();
      return { error: "expired", at };
    }
    return { resent: result, at };
  } catch (error) {
    console.error("[auth] renvoi du code impossible", error);
    return { error: "unavailable", at };
  }
}

/** Retour au formulaire de connexion, pour un autre compte ou après expiration. */
export async function restartLogin(): Promise<void> {
  const locale = await getLocale();
  await cancelChallenge();
  await clearChallengeCookie();
  redirect({ href: "/login", locale });
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

/** Sans destination, le backoffice est la page d'accueil du personnel. */
function afterLoginHref(
  role: string,
  next: FormDataEntryValue | null,
): string {
  const dest = safeNext(next);
  if (dest !== "/") return dest;
  if (role === "ADMIN" || role === "ORGANIZER" || role === "ORGANIZER_VIEWER") {
    return "/admin";
  }
  if (role === "DOOR_STAFF") return "/door";
  if (role === "RESELLER_AGENT") return "/pos";
  return "/";
}

async function clientIp(): Promise<string> {
  return clientIpFrom(await headers());
}
