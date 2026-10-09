"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { assertOrganizerAccess, catalogActor } from "@/lib/admin/access";
import { failure, readText, success, type FormState } from "@/lib/admin/form";
import { inviteReportRecipients, sendInvitationReport } from "@/lib/invitations/report";
import { prisma } from "@/lib/prisma";
import { consume } from "@/lib/rate-limit";

const MAX_RECIPIENTS = 10;

function readEmails(raw: string): string[] | null {
  const list = [...new Set(raw.split(/[\s,;]+/).map((a) => a.trim().toLowerCase()).filter(Boolean))];
  if (list.length > MAX_RECIPIENTS) return null;
  return list.every((a) => z.email().max(200).safeParse(a).success) ? list : null;
}

async function ownedOrganizer(formData: FormData) {
  const { user, organizerId } = await catalogActor();
  const id = readText(formData, "organizerId");
  if (!id || !(await assertOrganizerAccess(id, organizerId))) return null;
  const organizer = await prisma.organizer.findUnique({
    where: { id },
    select: {
      id: true,
      inviteReportFrequency: true,
      inviteReportEmails: true,
      notifyEmails: true,
    },
  });
  return organizer ? { user, organizer } : null;
}

export async function saveInviteReport(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await ownedOrganizer(formData);
  if (!actor) return failure("notFound");
  const frequency = z
    .enum(["NONE", "DAILY", "WEEKLY"])
    .safeParse(readText(formData, "frequency") || "NONE");
  if (!frequency.success) return failure("invalid");
  const emails = readEmails(readText(formData, "emails"));
  if (!emails) return failure("emails");

  await prisma.organizer.update({
    where: { id: actor.organizer.id },
    data: {
      inviteReportFrequency: frequency.data,
      inviteReportEmails: emails,
      // Nouvelle fréquence : le premier rapport automatique part à la prochaine échéance.
      ...(actor.organizer.inviteReportFrequency !== frequency.data
        ? { lastInviteReportAt: new Date() }
        : {}),
    },
  });
  revalidatePath("/admin/invitations");
  return success();
}

export async function sendInviteReportNow(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await ownedOrganizer(formData);
  if (!actor) return failure("notFound");
  if (!consume(`invite-report:${actor.organizer.id}`, 5, 60 * 60_000)) return failure("throttled");
  const configured = inviteReportRecipients(actor.organizer);
  const recipients = configured.length > 0 ? configured : [actor.user.email];
  const sent = await sendInvitationReport(actor.organizer.id, recipients);
  return sent ? success(recipients.join(", ")) : failure("notSent");
}
