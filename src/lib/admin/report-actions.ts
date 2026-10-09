"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { assertOrganizerAccess, catalogActor } from "@/lib/admin/access";
import { failure, readText, success, type FormState } from "@/lib/admin/form";
import { reportRecipients, sendOrganizerReport } from "@/lib/reports/report";
import { REPORT_SECTIONS, type ReportSection } from "@/lib/reports/summary";
import { prisma } from "@/lib/prisma";
import { consume } from "@/lib/rate-limit";

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
    select: { id: true, reportFrequency: true, reportEmails: true, notifyEmails: true },
  });
  return organizer ? { user, organizer } : null;
}

export async function saveReportSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await ownedOrganizer(formData);
  if (!actor) return failure("notFound");
  const frequency = z
    .enum(["NONE", "DAILY", "WEEKLY"])
    .safeParse(readText(formData, "frequency") || "NONE");
  if (!frequency.success) return failure("invalid");
  const emails = readEmails(readText(formData, "emails"));
  if (!emails) return failure("emails");
  const sections = readSectionList(formData);
  if (sections.length === 0) return failure("sections");

  await prisma.organizer.update({
    where: { id: actor.organizer.id },
    data: {
      reportFrequency: frequency.data,
      reportEmails: emails,
      reportSections: sections,
      // Nouvelle fréquence : le premier rapport automatique part à la prochaine échéance.
      ...(actor.organizer.reportFrequency !== frequency.data ? { lastReportAt: new Date() } : {}),
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
