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
 * Équipe d'un organisateur : les personnes qu'il invite.
 *
 * Chacune reçoit un seul accès, choisi à l'invitation :
 * - « ventes » (ORGANIZER_VIEWER) : consulte les ventes, sans rien modifier ;
 * - « équipe d'entrée » (DOOR_STAFF) : contrôle les billets et/ou tient la
 *   caisse sur place (d'un spectacle ou de tous), et ne voit rien d'autre.
 * L'organisateur n'agit que sur son équipe ; l'administrateur choisit
 * l'organisateur concerné.
 */

export type TeamState =
  | { ok: true; email: string }
  | { ok: false; error: "invalid" | "forbidden" | "otherRole" | "throttled" | "unavailable" | "noAccess" }
  | undefined;

const INVITATION_DAYS = 7;

const InviteSchema = z.object({
  email: z.email().max(200),
  name: z.string().trim().max(120).optional(),
  organizerId: z.string().optional(),
  locale: z.enum(["fr", "en", "de", "it"]).default("fr"),
  access: z.enum(["stats", "door"]).default("stats"),
  scan: z.boolean().default(false),
  till: z.boolean().default(false),
  manager: z.boolean().default(false),
  tillEventId: z.string().max(40).optional(),
});

export type TeamAccess = "stats" | "door";

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
    access: formData.get("access") || undefined,
    scan: formData.get("scan") === "on",
    till: formData.get("till") === "on",
    manager: formData.get("manager") === "on",
    tillEventId: formData.get("tillEventId") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "invalid" };
  const door = parsed.data.access === "door";
  if (door && !parsed.data.scan && !parsed.data.till) return { ok: false, error: "noAccess" };

  const actor = await actorOrganizer(parsed.data.organizerId);
  if (!actor) return { ok: false, error: "forbidden" };

  if (!consume(`invite:${actor.actorId}`, 20, 60 * 60_000)) {
    return { ok: false, error: "throttled" };
  }

  const { email, name, locale, access, scan, till, manager } = parsed.data;
  // Caisse d'un seul spectacle : il doit appartenir à cet organisateur.
  let tillEventId: string | null = null;
  if (door && till && parsed.data.tillEventId) {
    const event = await prisma.event.findFirst({
      where: { id: parsed.data.tillEventId, organizerId: actor.organizerId },
      select: { id: true },
    });
    if (!event) return { ok: false, error: "invalid" };
    tillEventId = event.id;
  }
  const existing = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      role: true,
      statsOrganizerId: true,
      doorOrganizerId: true,
      name: true,
      locale: true,
    },
  });

  // Un compte client entre dans l'équipe : il garde ses billets. Un membre de
  // cette même équipe peut changer d'accès. Tout autre rôle (organisateur,
  // admin, membre d'une autre équipe) reste tel quel : l'inviter ici lui
  // retirerait des droits sans qu'il le sache.
  if (existing && existing.role !== "CUSTOMER" && !isMember(existing, actor.organizerId)) {
    return { ok: false, error: "otherRole" };
  }

  const roleData =
    access === "door"
      ? {
          role: "DOOR_STAFF" as const,
          doorOrganizerId: actor.organizerId,
          statsOrganizerId: null,
          doorScan: scan,
          doorTill: till,
          doorTillEventId: till ? tillEventId : null,
          doorTillManager: till && manager,
        }
      : {
          role: "ORGANIZER_VIEWER" as const,
          statsOrganizerId: actor.organizerId,
          doorOrganizerId: null,
          doorScan: true,
          doorTill: false,
          doorTillEventId: null,
          doorTillManager: false,
        };

  try {
    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: {
            ...roleData,
            name: existing.name ?? name ?? null,
          },
          select: { id: true, name: true, locale: true },
        })
      : await prisma.user.create({
          data: {
            email,
            name: name || null,
            locale,
            ...roleData,
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
      access,
      door: { scan, till },
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
    where: { id: userId, ...memberWhere(actor.organizerId) },
    data: {
      role: "CUSTOMER",
      statsOrganizerId: null,
      doorOrganizerId: null,
      doorScan: true,
      doorTill: false,
      doorTillEventId: null,
      doorTillManager: false,
    },
  });
  if (count !== 1) return { ok: false, error: "forbidden" };

  await destroyAllSessions(userId);
  revalidatePath("/admin/team");
  return { ok: true, email: "" };
}

function isMember(
  user: { role: string; statsOrganizerId: string | null; doorOrganizerId: string | null },
  organizerId: string,
): boolean {
  return (
    (user.role === "ORGANIZER_VIEWER" && user.statsOrganizerId === organizerId) ||
    (user.role === "DOOR_STAFF" && user.doorOrganizerId === organizerId)
  );
}

function memberWhere(organizerId: string) {
  return {
    OR: [
      { role: "ORGANIZER_VIEWER" as const, statsOrganizerId: organizerId },
      { role: "DOOR_STAFF" as const, doorOrganizerId: organizerId },
    ],
  };
}
