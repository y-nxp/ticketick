"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { assertOrganizerAccess, catalogActor } from "@/lib/admin/access";
import { failure, readText, success, type FormState } from "@/lib/admin/form";
import { reportRecipients, sendOrganizerReport } from "@/lib/reports/report";
import { REPORT_SECTIONS, type ReportSection } from "@/lib/reports/summary";
import { prisma } from "@/lib/prisma";
import { consume } from "@/lib/rate-limit";
import { lastClosedPeriod } from "@/lib/resellers/report";

const MAX_RECIPIENTS = 10;

function readEmails(raw: string): string[] | null {
  const list = [...new Set(raw.split(/[\s,;]+/).map((a) => a.trim().toLowerCase()).filter(Boolean))];
  if (list.length > MAX_RECIPIENTS) return null;
  return list.every((a) => z.email().max(200).safeParse(a).success) ? list : null;
}

function readSectionList(formData: FormData): ReportSection[] {
  const chosen = formData.getAll("sections").map(String);
  return REPORT_SECTIONS.filter((s) => chosen.includes(s));
}

async function ownedOrganizer(formData: FormData) {
  const { user, organizerId } = await catalogActor();
  const id = readText(formData, "organizerId");
  if (!id || !(await assertOrganizerAccess(id, organizerId))) return null;
  const organizer = await prisma.organizer.findUnique({
    where: { id },
    select: {
      id: true,
      reportFrequency: true,
      reportWeekday: true,
      reportHour: true,
      reportEmails: true,
      notifyEmails: true,
    },
  });
  return organizer ? { user, organizer } : null;
}

export async function saveReportSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await ownedOrganizer(formData);
  if (!actor) return failure("notFound");
  const frequency = z
    .enum(["NONE", "DAILY", "WEEKLY"])
    .safeParse(readText(formData, "frequency") || "NONE");
  const weekday = z.coerce.number().int().min(1).max(7).safeParse(readText(formData, "weekday") || "1");
  const hour = z.coerce.number().int().min(0).max(23).safeParse(readText(formData, "hour") || "7");
  if (!frequency.success || !weekday.success || !hour.success) return failure("invalid");
  const emails = readEmails(readText(formData, "emails"));
  if (!emails) return failure("emails");
  const sections = readSectionList(formData);
  if (sections.length === 0) return failure("sections");

  const { reportFrequency, reportWeekday, reportHour } = actor.organizer;
  const rescheduled =
    reportFrequency !== frequency.data || reportWeekday !== weekday.data || reportHour !== hour.data;
  await prisma.organizer.update({
    where: { id: actor.organizer.id },
    data: {
      reportFrequency: frequency.data,
      reportWeekday: weekday.data,
      reportHour: hour.data,
      reportEmails: emails,
      reportSections: sections,
      // Nouvel horaire : rien pour une échéance déjà passée, la prochaine part à l'heure choisie.
      ...(rescheduled
        ? {
            lastReportAt:
              frequency.data === "NONE"
                ? null
                : (lastClosedPeriod(frequency.data, new Date(), {
                    weekday: weekday.data,
                    hour: hour.data,
                  })?.to ?? null),
          }
        : {}),
    },
  });
  revalidatePath("/admin/reports");
  return success();
}

export async function sendReportNow(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await ownedOrganizer(formData);
  if (!actor) return failure("notFound");
  const sections = readSectionList(formData);
  if (sections.length === 0) return failure("sections");
  if (!consume(`organizer-report:${actor.organizer.id}`, 5, 60 * 60_000)) return failure("throttled");
  const configured = reportRecipients(actor.organizer);
  const recipients = configured.length > 0 ? configured : [actor.user.email];
  const sent = await sendOrganizerReport(actor.organizer.id, { recipients, sections });
  revalidatePath("/admin/reports");
  return sent ? success(recipients.join(", ")) : failure("notSent");
}
