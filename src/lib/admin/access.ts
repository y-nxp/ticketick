import "server-only";

import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { requireCatalog, type CurrentUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";

/** Acteur du catalogue, et filtre organisateur (null = tout voir). */
export async function catalogActor(): Promise<{
  user: CurrentUser;
  organizerId: string | null;
}> {
  const user = await requireCatalog();
  return {
    user,
    organizerId: user.role === "ORGANIZER" ? user.organizerId : null,
  };
}

export async function assertOrganizerAccess(
  organizerId: string,
  actorOrganizerId: string | null,
): Promise<boolean> {
  return !actorOrganizerId || actorOrganizerId === organizerId;
}

export async function assertEventOwned(
  eventId: string,
  actorOrganizerId: string | null,
): Promise<boolean> {
  if (!actorOrganizerId) return true;
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { organizerId: true },
  });
  return event?.organizerId === actorOrganizerId;
}

export async function forbidIfForeignEvent(
  eventId: string,
  actorOrganizerId: string | null,
): Promise<void> {
  if (await assertEventOwned(eventId, actorOrganizerId)) return;
  return redirect({ href: "/forbidden", locale: await getLocale() });
}
