"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireRole } from "@/lib/auth/dal";
import { destroyAllSessions } from "@/lib/auth/session";
import { publicAppOrigin } from "@/lib/app-url";
import { sendStatsInvitationEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { consume } from "@/lib/rate-limit";

/**
 * Responsables invités par un organisateur.
 *
 * Un responsable consulte les ventes de l'organisateur qui l'a invité, sans
 * pouvoir rien modifier. L'organisateur n'agit que sur son équipe ;
 * l'administrateur choisit l'organisateur concerné.
 */

export type TeamState =
  | { ok: true; email: string }
  | { ok: false; error: "invalid" | "forbidden" | "otherRole" | "throttled" | "unavailable" }
  | undefined;

const INVITATION_DAYS = 7;

const InviteSchema = z.object({
  email: z.email().max(200),
  name: z.string().trim().max(120).optional(),
  organizerId: z.string().optional(),
  locale: z.enum(["fr", "en", "de", "it"]).default("fr"),
});

async function actorOrganizer(
  requested: string | undefined,
): Promise<{ organizerId: string; actorId: string } | null> {
  const user = await requireRole(["ADMIN", "ORGANIZER"]);
  if (user.role === "ORGANIZER") {
    return user.organizerId
      ? { organizerId: user.organizerId, actorId: user.id }
      : null;
  }
  if (!requested) return null;
  const exists = await prisma.organizer.count({ where: { id: requested } });
  return exists ? { organizerId: requested, actorId: user.id } : null;
}

export async function inviteStatsViewer(
  _state: TeamState,
  formData: FormData,
): Promise<TeamState> {
  const parsed = InviteSchema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    name: formData.get("name") || undefined,
    organizerId: formData.get("organizerId") || undefined,
    locale: formData.get("locale") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid" };

  const actor = await actorOrganizer(parsed.data.organizerId);
  if (!actor) return { ok: false, error: "forbidden" };

  if (!consume(`invite:${actor.actorId}`, 20, 60 * 60_000)) {
    return { ok: false, error: "throttled" };
  }

  const { email, name, locale } = parsed.data;
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, statsOrganizerId: true, name: true, locale: true },
  });

  // Un compte client devient responsable : il garde ses billets. Tout autre
  // rôle (organisateur, contrôleur, admin, responsable ailleurs) reste tel
  // quel : l'inviter ici lui retirerait des droits sans qu'il le sache.
  if (
    existing &&
    existing.role !== "CUSTOMER" &&
    !(existing.role === "ORGANIZER_VIEWER" && existing.statsOrganizerId === actor.organizerId)
  ) {
    return { ok: false, error: "otherRole" };
  }

  try {
    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: {
            role: "ORGANIZER_VIEWER",
            statsOrganizerId: actor.organizerId,
            name: existing.name ?? name ?? null,
          },
          select: { id: true, name: true, locale: true },
        })
      : await prisma.user.create({
          data: {
            email,
            name: name || null,
            locale,
            role: "ORGANIZER_VIEWER",
            statsOrganizerId: actor.organizerId,
          },
          select: { id: true, name: true, locale: true },
        });

    const token = randomBytes(32).toString("base64url");
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + INVITATION_DAYS * 24 * 3600_000),
      },
    });

    const organizer = await prisma.organizer.findUniqueOrThrow({
      where: { id: actor.organizerId },
      select: { name: true },
    });
    const lang = existing?.locale ?? locale;
    await sendStatsInvitationEmail({
      to: email,
      name: user.name,
      locale: lang,
      organizerName: organizer.name,
      url: `${publicAppOrigin()}/${lang}/reset-password?token=${token}`,
      expiresInDays: INVITATION_DAYS,
    });
  } catch (error) {
    console.error("[équipe] invitation impossible", error);
    return { ok: false, error: "unavailable" };
  }

  revalidatePath("/admin/team");
  return { ok: true, email };
}

export async function revokeStatsViewer(
  _state: TeamState,
  formData: FormData,
): Promise<TeamState> {
  const userId = String(formData.get("userId") ?? "");
  const actor = await actorOrganizer(
    String(formData.get("organizerId") ?? "") || undefined,
  );
  if (!actor || !userId) return { ok: false, error: "forbidden" };

  const { count } = await prisma.user.updateMany({
    where: {
      id: userId,
      role: "ORGANIZER_VIEWER",
      statsOrganizerId: actor.organizerId,
    },
    data: { role: "CUSTOMER", statsOrganizerId: null },
  });
  if (count !== 1) return { ok: false, error: "forbidden" };

  await destroyAllSessions(userId);
  revalidatePath("/admin/team");
  return { ok: true, email: "" };
}
