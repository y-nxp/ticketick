"use server";

import { refresh } from "next/cache";
import * as z from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "./dal";

/**
 * Coordonnées modifiables par la personne elle-même. L'e-mail n'en fait pas
 * partie : le changer exigerait de prouver la nouvelle adresse.
 */
const ProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^[+()\d\s./-]*$/),
});

export interface ProfileState {
  error?: "name" | "phoneInvalid" | "unavailable";
  values?: { firstName: string; lastName: string; phone: string };
  ok?: boolean;
}

export async function updateProfile(
  _state: ProfileState | undefined,
  formData: FormData,
): Promise<ProfileState> {
  const user = await requireAuth();

  const values = {
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
  };
  const parsed = ProfileSchema.safeParse(values);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { error: field === "phone" ? "phoneInvalid" : "name", values };
  }

  const { firstName, lastName, phone } = parsed.data;
  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { name: `${firstName} ${lastName}`, phone: phone || null },
    });
  } catch (error) {
    console.error("[account] mise à jour du profil impossible", error);
    return { error: "unavailable", values };
  }

  refresh();
  return { ok: true };
}
