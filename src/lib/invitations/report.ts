import "server-only";

import { createTranslator } from "next-intl";
import de from "../../../messages/de.json";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import it from "../../../messages/it.json";
import { publicAppOrigin } from "@/lib/app-url";
import { sendTableReportEmail } from "@/lib/email";
import { byLocale, intlLocale } from "@/lib/i18n-fallback";
import { prisma } from "@/lib/prisma";
import { lastClosedPeriod } from "@/lib/resellers/report";
import { t as tr, type Translated } from "@/lib/types";
import { EVENT_TIME_ZONE, formatPrice } from "@/lib/utils";
import { getInvitationSummary } from "./summary";

/**
 * Rapport des invitations d'un organisateur : état à l'instant de l'envoi,
 * séance par séance. Envoyé à la demande ou chaque matin (lundi pour
 * l'hebdomadaire), à la même heure que les récapitulatifs des points de vente.
 */

const MESSAGES = { fr, en, de, it };

export function inviteReportRecipients(organizer: {
  inviteReportEmails: string[];
  notifyEmails: string[];
}): string[] {
  return organizer.inviteReportEmails.length > 0
    ? organizer.inviteReportEmails
    : organizer.notifyEmails;
}

export async function sendInvitationReport(
  organizerId: string,
  recipients?: string[],
): Promise<boolean> {
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    select: {
      name: true,
      notifyEmails: true,
      inviteReportEmails: true,
      user: { select: { locale: true } },
    },
  });
  if (!organizer) return false;
  const to = recipients ?? inviteReportRecipients(organizer);
  if (to.length === 0) return false;

  const preferred = organizer.user?.locale ?? "fr";
  const locale = preferred in MESSAGES ? preferred : "fr";
  const t = createTranslator({
    locale,
    messages: byLocale(MESSAGES, locale),
    namespace: "inviteReport",
  });
  const intl = intlLocale(locale);
  const money = (cents: number) => formatPrice(cents, intl);
  const when = (date: Date, withTime: boolean) =>
    new Intl.DateTimeFormat(intl, {
      timeZone: EVENT_TIME_ZONE,
      weekday: withTime ? "short" : undefined,
      day: "numeric",
      month: withTime ? "short" : "long",
      year: withTime ? undefined : "numeric",
      hour: withTime ? "2-digit" : undefined,
      minute: withTime ? "2-digit" : undefined,
    }).format(date);

  const now = new Date();
  const { sessions, totals } = await getInvitationSummary(organizerId, now);
  const [first, ...bcc] = to;
  const result = await sendTableReportEmail(
    {
      to: first!,
      bcc,
      subject: t("subject", { name: organizer.name, date: when(now, false) }),
      heading: t("heading", { name: organizer.name }),
      period: t("asOf", { date: when(now, false) }),
      columns: [t("date"), t("guestHeld"), t("offered"), t("paid"), t("paidAmount"), t("onSale")],
      rows: sessions.map((s) => [
        `${tr(s.eventTitle as Translated, locale)} — ${when(s.startsAt, true)}`,
        String(s.guestHeld),
        String(s.offered),
        String(s.paid),
        s.paidCents > 0 ? money(s.paidCents) : "–",
        String(s.onSale),
      ]),
      emptyRows: t("empty"),
      summaryTitle: t("totals"),
      summary: [
        { label: t("guestHeld"), value: String(totals.guestHeld) },
        { label: t("offered"), value: String(totals.offered) },
        { label: t("paid"), value: String(totals.paid) },
        { label: t("paidAmount"), value: money(totals.paidCents) },
        { label: t("sold"), value: String(totals.sold) },
        { label: t("onSale"), value: String(totals.onSale) },
      ],
      footer: t("footer"),
      url: `${publicAppOrigin()}/${locale}/admin/invitations`,
      button: t("open"),
    },
    "rapport des invitations",
  );
  return result.sent;
}

/** Passe du planificateur : un rapport par période close, une seule fois. */
export async function sendDueInvitationReports(now = new Date()): Promise<number> {
  const organizers = await prisma.organizer.findMany({
    where: { inviteReportFrequency: { in: ["DAILY", "WEEKLY"] } },
    select: { id: true, inviteReportFrequency: true, lastInviteReportAt: true },
  });
  let n = 0;
  for (const organizer of organizers) {
    const period = lastClosedPeriod(organizer.inviteReportFrequency as "DAILY" | "WEEKLY", now);
    if (!period) continue;
    if (organizer.lastInviteReportAt && organizer.lastInviteReportAt >= period.to) continue;
    // Réservé avant l'envoi : deux instances ne l'envoient pas deux fois.
    const { count } = await prisma.organizer.updateMany({
      where: {
        id: organizer.id,
        OR: [{ lastInviteReportAt: null }, { lastInviteReportAt: { lt: period.to } }],
      },
      data: { lastInviteReportAt: period.to },
    });
    if (count !== 1) continue;
    try {
      if (await sendInvitationReport(organizer.id)) n += 1;
    } catch (error) {
      console.error("[invitations] rapport impossible", organizer.id, error);
    }
  }
  return n;
}

const INTERVAL_MS = 15 * 60 * 1000;
let started = false;
let running = false;

export function startInvitationReports(): void {
  if (started) return;
  started = true;
  const pass = async () => {
    if (running) return;
    running = true;
    try {
      const n = await sendDueInvitationReports();
      if (n > 0) console.log(`[invitations] ${n} rapport(s) envoyé(s)`);
    } catch (error) {
      console.error("[invitations] planificateur", error);
    } finally {
      running = false;
    }
  };
  setTimeout(() => void pass(), 90 * 1000).unref();
  setInterval(() => void pass(), INTERVAL_MS).unref();
}
