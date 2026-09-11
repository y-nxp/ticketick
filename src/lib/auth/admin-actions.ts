"use server";

import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "./dal";
import { destroyAllSessions } from "./session";

/**
 * Actions d'administration des comptes.
 *
 * Chacune revérifie le rôle : une action serveur est joignable directement,
 * indépendamment de la page qui l'expose, et l'interface qui la déclenche ne
 * constitue donc pas une protection.
 */

export interface AdminActionState {
  error?: "forbidden" | "self" | "lastAdmin" | "notFound" | "invalid";
  ok?: boolean;
}

const RoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(UserRole),
});

export async function setUserRole(
  _state: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();

  const parsed = RoleSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: "invalid" };

  const { userId, role } = parsed.data;

  // Se retirer soi-même les droits fermerait le backoffice à celui qui vient
  // de s'y connecter, sans recours depuis l'interface.
  if (userId === admin.id) return { error: "self" };

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!target) return { error: "notFound" };

  if (target.role === "ADMIN" && role !== "ADMIN" && (await isLastAdmin())) {
    return { error: "lastAdmin" };
  }

  await prisma.user.update({ where: { id: userId }, data: { role } });

  // Le rôle est relu à chaque requête, mais fermer les sessions rend le
  // changement immédiat et vérifiable plutôt qu'implicite.
  await destroyAllSessions(userId);

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function setUserActive(
  _state: AdminActionState | undefined,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();

  const userId = formData.get("userId");
  const active = formData.get("active") === "true";
  if (typeof userId !== "string" || !userId) return { error: "invalid" };

  if (userId === admin.id) return { error: "self" };

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!target) return { error: "notFound" };

  if (!active && target.role === "ADMIN" && (await isLastAdmin())) {
    return { error: "lastAdmin" };
  }

  await prisma.user.update({ where: { id: userId }, data: { active } });

  // Suspendre un compte doit couper l'accès sur-le-champ, sans attendre
  // l'expiration des sessions déjà ouvertes.
  if (!active) await destroyAllSessions(userId);

  revalidatePath("/admin/users");
  return { ok: true };
}

/**
 * Vrai s'il ne reste qu'un seul administrateur actif.
 *
 * Sans ce contrôle, la dernière rétrogradation rendrait le backoffice
 * inaccessible et il faudrait repasser par le serveur pour en ressortir.
 */
async function isLastAdmin(): Promise<boolean> {
  const count = await prisma.user.count({
    where: { role: "ADMIN", active: true },
  });
  return count <= 1;
}
