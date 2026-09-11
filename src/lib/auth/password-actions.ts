"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "./dal";
import { createSession, destroyAllSessions } from "./session";

/**
 * Changement de mot de passe par la personne elle-même.
 *
 * Exige le mot de passe actuel : sans lui, quiconque trouverait un poste
 * resté ouvert s'approprierait le compte en une manipulation.
 */

const ChangeSchema = z
  .object({
    current: z.string().min(1),
    next: z.string().min(12).max(200),
    confirm: z.string().min(1),
  })
  .refine((v) => v.next === v.confirm, { path: ["confirm"] });

export interface PasswordState {
  error?: "wrong" | "tooShort" | "mismatch" | "same" | "throttled" | "unavailable";
  ok?: boolean;
}

/**
 * Limitation des essais sur le mot de passe actuel : sans elle, un poste
 * laissé ouvert permettrait de le deviner à l'aveugle.
 */
const ATTEMPTS = { max: 5, windowMs: 15 * 60 * 1000 };
const attempts = new Map<string, number[]>();

export async function changePassword(
  _state: PasswordState | undefined,
  formData: FormData,
): Promise<PasswordState> {
  const user = await requireAuth();

  const raw = {
    current: formData.get("current"),
    next: formData.get("next"),
    confirm: formData.get("confirm"),
  };

  // Distinguer ces deux cas ne révèle rien : ils portent sur ce que la
  // personne vient de saisir, non sur l'existence d'un compte.
  if (typeof raw.next === "string" && raw.next.length < 12) {
    return { error: "tooShort" };
  }
  if (raw.next !== raw.confirm) return { error: "mismatch" };

  const parsed = ChangeSchema.safeParse(raw);
  if (!parsed.success) return { error: "tooShort" };

  const { current, next } = parsed.data;
  if (current === next) return { error: "same" };

  const key = `${user.id}:${await clientIp()}`;
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter(
    (t) => now - t < ATTEMPTS.windowMs,
  );
  if (recent.length >= ATTEMPTS.max) return { error: "throttled" };

  let record;
  try {
    record = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
  } catch (error) {
    console.error("[auth] lecture du compte impossible", error);
    return { error: "unavailable" };
  }

  const matches =
    !!record?.passwordHash &&
    (await bcrypt.compare(current, record.passwordHash));

  if (!matches) {
    attempts.set(key, [...recent, now]);
    return { error: "wrong" };
  }

  attempts.delete(key);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(next, 12) },
  });

  // Toutes les sessions tombent, y compris celle en cours : un accès obtenu
  // avec l'ancien mot de passe ne doit pas survivre au changement. Une
  // nouvelle est ouverte aussitôt pour ne pas éjecter la personne qui vient
  // légitimement de le modifier.
  await destroyAllSessions(user.id);
  await createSession(user.id);

  return { ok: true };
}

async function clientIp(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "inconnue";
  return headerList.get("x-real-ip") ?? "inconnue";
}
