"use server";

import { revalidatePath } from "next/cache";
import { generateApiKey } from "@/lib/api/keys";
import { requireCatalog } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { readBoolean, readText } from "./form";

/**
 * Clés de l'API publique (agents IA, outils tiers). Un organisateur gère
 * les siennes ; l'admin, celles de n'importe quel organisateur. La clé en
 * clair n'est renvoyée qu'ici, une seule fois.
 */

export type ApiKeyState =
  | undefined
  | { ok: true; key: string; name: string }
  | { ok: false; error: "nameRequired" | "organizer" | "tooMany" | "unavailable" };

const MAX_ACTIVE = 20;

export async function createApiKey(_state: ApiKeyState, data: FormData): Promise<ApiKeyState> {
  const user = await requireCatalog();
  const organizerId = user.role === "ORGANIZER" ? user.organizerId : readText(data, "organizerId");
  if (!organizerId) return { ok: false, error: "organizer" };
  const organizer = await prisma.organizer.findUnique({ where: { id: organizerId }, select: { id: true } });
  if (!organizer) return { ok: false, error: "organizer" };

  const name = readText(data, "name").slice(0, 80);
  if (!name) return { ok: false, error: "nameRequired" };

  const active = await prisma.apiKey.count({ where: { organizerId, revokedAt: null } });
  if (active >= MAX_ACTIVE) return { ok: false, error: "tooMany" };

  const { key, prefix, hash } = generateApiKey();
  try {
    await prisma.apiKey.create({
      data: {
        organizerId,
        name,
        prefix,
        hash,
        canPublish: readBoolean(data, "canPublish"),
        createdById: user.impersonator ? user.impersonator.id : user.id,
      },
    });
  } catch (error) {
    console.error("[admin] création clé d'API", error instanceof Error ? error.message : "inconnue");
    return { ok: false, error: "unavailable" };
  }
  revalidatePath("/admin/api");
  return { ok: true, key, name };
}

export async function revokeApiKey(data: FormData): Promise<void> {
  const user = await requireCatalog();
  const id = readText(data, "id");
  const row = await prisma.apiKey.findUnique({ where: { id }, select: { organizerId: true, revokedAt: true } });
  if (!row || row.revokedAt) return;
  if (user.role === "ORGANIZER" && row.organizerId !== user.organizerId) return;
  await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  revalidatePath("/admin/api");
}
