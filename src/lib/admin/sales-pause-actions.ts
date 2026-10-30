"use server";

import { revalidatePath } from "next/cache";
import { assertEventOwned, catalogActor } from "@/lib/admin/access";
import { publicAppOrigin } from "@/lib/app-url";
import { sendSalesResumedEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

/**
 * Vente suspendue d'un spectacle : l'arrêter, la reprendre, prévenir les
 * personnes qui ont laissé leur adresse sur la fiche.
 *
 * Chaque action vérifie elle-même les droits, comme le reste du backoffice.
 */

export type SalesPauseResult =
  | { ok: true; sent?: number; failed?: number }
  | { ok: false; error: "forbidden" | "notFound" | "stillPaused" | "unavailable" };

/** Au-delà, un second clic envoie la suite : l'action reste courte. */
const BATCH = 300;

function refresh(eventId: string) {
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/admin/events");
  // Accueil, fiches, page de l'organisateur et module intégré.
  revalidatePath("/", "layout");
}

export async function setSalesPaused(
  eventId: string,
  paused: boolean,
): Promise<SalesPauseResult> {
  const { organizerId } = await catalogActor();
  if (typeof eventId !== "string" || typeof paused !== "boolean") {
    return { ok: false, error: "notFound" };
  }
  if (!(await assertEventOwned(eventId, organizerId))) return { ok: false, error: "forbidden" };

  const { count } = await prisma.event.updateMany({
    where: { id: eventId },
    data: { salesPaused: paused },
  });
  if (!count) return { ok: false, error: "notFound" };
  refresh(eventId);
  return { ok: true };
}

/** Envoie le message de reprise aux personnes encore en attente. */
export async function notifySalesAlerts(eventId: string): Promise<SalesPauseResult> {
  const { organizerId } = await catalogActor();
  if (typeof eventId !== "string") return { ok: false, error: "notFound" };
  if (!(await assertEventOwned(eventId, organizerId))) return { ok: false, error: "forbidden" };

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      slug: true,
      title: true,
      salesPaused: true,
      contactEmail: true,
      organizer: { select: { name: true, email: true } },
      sessions: {
        where: { status: { not: "CANCELLED" }, startsAt: { gte: new Date() } },
        orderBy: { startsAt: "asc" },
        select: { startsAt: true },
        take: 1,
      },
    },
  });
  if (!event) return { ok: false, error: "notFound" };
  if (event.salesPaused) return { ok: false, error: "stillPaused" };

  const pending = await prisma.salesAlert.findMany({
    where: { eventId, notifiedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, locale: true },
    take: BATCH,
  });

  const origin = publicAppOrigin();
  const titles = (event.title ?? {}) as Record<string, string>;
  const next = event.sessions[0]?.startsAt ?? null;

  let sent = 0;
  let failed = 0;
  for (const alert of pending) {
    const locale = alert.locale;
    const result = await sendSalesResumedEmail({
      to: alert.email,
      locale,
      title: titles[locale] || (locale === "es" ? titles.en : "") || titles.fr || event.slug,
      when: next ? formatDate(next, `${locale}-CH`) : null,
      url: `${origin}${locale === "fr" ? "" : `/${locale}`}/events/${event.slug}`,
      organizerName: event.organizer.name,
      replyTo: event.contactEmail || event.organizer.email,
    });
    if (result.sent) {
      await prisma.salesAlert.update({
        where: { id: alert.id },
        data: { notifiedAt: new Date() },
      });
      sent += 1;
    } else {
      failed += 1;
    }
  }

  revalidatePath(`/admin/events/${eventId}`);
  return { ok: true, sent, failed };
}

/** Retire une adresse de la liste (demande de la personne, doublon). */
export async function deleteSalesAlert(alertId: string): Promise<SalesPauseResult> {
  const { organizerId } = await catalogActor();
  if (typeof alertId !== "string") return { ok: false, error: "notFound" };
  const alert = await prisma.salesAlert.findUnique({
    where: { id: alertId },
    select: { eventId: true },
  });
  if (!alert) return { ok: false, error: "notFound" };
  if (!(await assertEventOwned(alert.eventId, organizerId))) {
    return { ok: false, error: "forbidden" };
  }
  await prisma.salesAlert.delete({ where: { id: alertId } });
  revalidatePath(`/admin/events/${alert.eventId}`);
  return { ok: true };
}
