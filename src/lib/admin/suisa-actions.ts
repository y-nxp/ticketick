"use server";

import { revalidatePath } from "next/cache";
import { assertEventOwned, catalogActor } from "@/lib/admin/access";
import { failure, readText, success, type FormState } from "@/lib/admin/form";
import { prisma } from "@/lib/prisma";

const MUSIC = ["PROTECTED", "PUBLIC_DOMAIN", "NONE"] as const;
type Music = (typeof MUSIC)[number];

/** Musique d'un spectacle pour le rapport SUISA ; vide = à indiquer. */
export async function saveSuisaMusic(_prev: FormState, formData: FormData): Promise<FormState> {
  const { organizerId } = await catalogActor();
  const eventId = readText(formData, "eventId");
  const raw = readText(formData, "music");
  if (!eventId || !(await assertEventOwned(eventId, organizerId))) return failure("forbidden");
  if (raw && !MUSIC.includes(raw as Music)) return failure("invalid");
  await prisma.event.update({
    where: { id: eventId },
    data: { suisaMusic: raw ? (raw as Music) : null },
  });
  revalidatePath("/[locale]/admin/reports/suisa", "page");
  return success();
}

/** Lit un nombre de billets (vide = rien). */
function readCount(formData: FormData, name: string): number | null | "bad" {
  const raw = readText(formData, name);
  if (!raw) return null;
  if (!/^\d{1,6}$/.test(raw)) return "bad";
  return Number(raw);
}

/** Lit un montant en francs, « 1'234.50 » admis (vide = rien). */
function readAmount(formData: FormData, name: string): number | null | "bad" {
  const raw = readText(formData, name).replace(/['\s’]/g, "").replace(",", ".");
  if (!raw) return null;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(raw)) return "bad";
  return Math.round(Number(raw) * 100);
}

/** Caisse du soir tenue hors ticketick : billets payants et montant TTC. */
export async function saveDoorSales(_prev: FormState, formData: FormData): Promise<FormState> {
  const { organizerId } = await catalogActor();
  const sessionId = readText(formData, "sessionId");
  const session = sessionId
    ? await prisma.eventSession.findUnique({ where: { id: sessionId }, select: { eventId: true } })
    : null;
  if (!session || !(await assertEventOwned(session.eventId, organizerId))) return failure("forbidden");
  const tickets = readCount(formData, "doorTickets");
  const cents = readAmount(formData, "doorAmount");
  if (tickets === "bad" || cents === "bad") return failure("invalid");
  await prisma.eventSession.update({
    where: { id: sessionId },
    data: { doorTickets: tickets, doorRevenueCents: cents },
  });
  revalidatePath("/[locale]/admin/reports/suisa", "page");
  return success();
}
