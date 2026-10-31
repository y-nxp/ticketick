import { NextResponse } from "next/server";
import { z } from "zod";
import { locales } from "@/i18n/routing";
import { subscribeSalesAlert } from "@/lib/partner/data";
import { badRequest, notFound, partnerRoute } from "@/lib/partner/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const payload = z.object({
  email: z.string().max(200),
  locale: z.string().max(5).optional(),
});

/**
 * Le SAV téléphonique inscrit un appelant à l'alerte de reprise d'un spectacle
 * dont la vente est suspendue — l'équivalent du champ e-mail de la fiche.
 * 409 `not_paused` si la vente n'est pas suspendue : il n'y a rien à attendre.
 */
export const POST = partnerRoute(async ({ organizerId, locale, body, url }) => {
  const parsed = payload.safeParse(body);
  const email = parsed.success ? parsed.data.email.trim().toLowerCase() : "";
  if (!email || !EMAIL.test(email)) return badRequest("invalid_email");
  const eventId = url.pathname.split("/").at(-2) ?? "";
  const wanted = parsed.success ? (parsed.data.locale ?? locale) : locale;
  const result = await subscribeSalesAlert({
    eventId,
    email,
    locale: (locales as readonly string[]).includes(wanted) ? wanted : "fr",
    organizerId,
  });
  if (!result.ok && result.reason === "not_found") return notFound();
  if (!result.ok) return NextResponse.json({ error: "not_paused" }, { status: 409 });
  return { ok: true };
});
