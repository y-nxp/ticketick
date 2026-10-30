"use server";

import { headers } from "next/headers";
import { locales } from "@/i18n/routing";
import { prisma } from "@/lib/prisma";
import { clientIpFrom, consume } from "@/lib/rate-limit";

export type SalesAlertState =
  | { ok: true }
  | { error: "email" | "closed" | "throttled" | "unavailable" }
  | undefined;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Fiche d'un spectacle dont la vente est suspendue : le visiteur laisse son
 * adresse pour être prévenu de la reprise. Sans compte : l'adresse ne sert
 * qu'à ce message, envoyé depuis l'admin.
 */
export async function subscribeSalesAlert(
  _state: SalesAlertState,
  data: FormData,
): Promise<SalesAlertState> {
  const eventId = String(data.get("eventId") ?? "");
  const email = String(data.get("email") ?? "").trim().toLowerCase();
  const rawLocale = String(data.get("locale") ?? "fr");
  const locale = (locales as readonly string[]).includes(rawLocale) ? rawLocale : "fr";

  if (!email || email.length > 200 || !EMAIL.test(email)) return { error: "email" };

  const ip = clientIpFrom(await headers());
  if (!consume(`sales-alert:${ip}`, 10, 60 * 60_000)) return { error: "throttled" };

  try {
    const event = await prisma.event.findFirst({
      where: { id: eventId, status: { not: "DRAFT" } },
      select: { salesPaused: true },
    });
    if (!event?.salesPaused) return { error: "closed" };

    // Une nouvelle inscription après un premier message de reprise (vente
    // suspendue une seconde fois) remet la personne en attente.
    await prisma.salesAlert.upsert({
      where: { eventId_email: { eventId, email } },
      create: { eventId, email, locale },
      update: { locale, notifiedAt: null },
    });
    return { ok: true };
  } catch (error) {
    console.error("[sales-alert] inscription", error);
    return { error: "unavailable" };
  }
}
