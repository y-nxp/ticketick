import "server-only";

import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

/**
 * Gestion des sessions.
 *
 * Le cookie ne transporte que l'identifiant d'une session enregistrée en base,
 * signé pour qu'il ne puisse pas être forgé. Le rôle n'y figure pas : il est
 * relu à chaque requête, sinon une révocation ou un changement de droits
 * resterait sans effet jusqu'à l'expiration du jeton.
 */

const COOKIE_NAME = "ticketick_session";
const DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Le secret est lu paresseusement : au chargement du module, `next build`
 * l'évaluerait alors qu'aucune variable d'environnement d'exécution n'est
 * encore disponible, et le build échouerait.
 */
function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET absent : impossible de signer les sessions. " +
        "Générer une valeur avec `openssl rand -base64 32`.",
    );
  }
  return new TextEncoder().encode(secret);
}

async function sign(sessionId: string, expiresAt: Date): Promise<string> {
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secretKey());
}

/** Renvoie l'identifiant de session si la signature et l'échéance tiennent. */
export async function readSessionId(
  token: string | undefined,
): Promise<string | undefined> {
  if (!token) return undefined;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
    });
    const sid = payload.sid;
    return typeof sid === "string" ? sid : undefined;
  } catch {
    // Signature invalide ou jeton expiré : l'un et l'autre valent absence de
    // session, sans qu'il y ait lieu de distinguer les deux cas.
    return undefined;
  }
}

/** Ouvre une session et dépose le cookie correspondant. */
export async function createSession(userId: string): Promise<void> {
  const expiresAt = new Date(Date.now() + DURATION_MS);
  const headerList = await headers();

  const session = await prisma.session.create({
    data: {
      userId,
      expiresAt,
      userAgent: headerList.get("user-agent")?.slice(0, 255) ?? null,
      ipAddress: clientIp(headerList),
    },
    select: { id: true },
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, await sign(session.id, expiresAt), {
    httpOnly: true,
    // En développement le site est servi en clair : exiger HTTPS empêcherait
    // le navigateur d'enregistrer le cookie.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

/** Ferme la session courante, en base comme dans le navigateur. */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = await readSessionId(cookieStore.get(COOKIE_NAME)?.value);

  if (sessionId) {
    // La session a pu être révoquée entre-temps : son absence n'est pas une
    // erreur, le but étant seulement qu'elle ne subsiste pas.
    await prisma.session
      .delete({ where: { id: sessionId } })
      .catch(() => undefined);
  }

  cookieStore.delete(COOKIE_NAME);
}

/** Ferme toutes les sessions d'un compte (mot de passe changé, compte suspendu). */
export async function destroyAllSessions(userId: string): Promise<number> {
  const { count } = await prisma.session.deleteMany({ where: { userId } });
  return count;
}

export async function currentSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE_NAME)?.value;
}

export const sessionCookieName = COOKIE_NAME;

function clientIp(headerList: Headers): string | null {
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return headerList.get("x-real-ip");
}
