import "server-only";

import { createTranslator } from "next-intl";
import de from "../../../messages/de.json";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import it from "../../../messages/it.json";
import { publicAppOrigin } from "@/lib/app-url";
import { sendTableReportEmail, type ReportTable } from "@/lib/email";
import { byLocale, intlLocale } from "@/lib/i18n-fallback";
import { prisma } from "@/lib/prisma";
import { lastClosedPeriod } from "@/lib/resellers/report";
import { t as tr, type Translated } from "@/lib/types";
import { EVENT_TIME_ZONE, formatPrice } from "@/lib/utils";
import { getOrganizerReport, readSections, type ReportSection } from "./summary";

/**
 * Rapport d'un organisateur : ventes, invitations et places restantes des
 * dates à venir, selon les parties choisies. Envoyé à la demande ou chaque
 * matin (lundi pour l'hebdomadaire), à l'heure des récapitulatifs des points
 * de vente. Les « nouveaux » billets comptent depuis l'envoi précédent.
 */

const MESSAGES = { fr, en, de, it };
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function reportRecipients(organizer: {
  reportEmails: string[];
  notifyEmails: string[];
}): string[] {
  return organizer.reportEmails.length > 0 ? organizer.reportEmails : organizer.notifyEmails;
}

/** Début des « nouveaux » : l'envoi précédent, sinon une semaine. */
export function reportSince(lastSentAt: Date | null, now = new Date()): Date {
  return lastSentAt ?? new Date(now.getTime() - WEEK_MS);
}

export async function sendOrganizerReport(
  organizerId: string,
  options: { recipients?: string[]; sections?: ReportSection[] } = {},
): Promise<boolean> {
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    select: {
      name: true,
      notifyEmails: true,
      reportEmails: true,
      reportSections: true,
      lastReportSentAt: true,
      user: { select: { locale: true } },
    },
  });
  if (!organizer) return false;
  const to = options.recipients ?? reportRecipients(organizer);
  if (to.length === 0) return false;
  const sections = options.sections ?? readSections(organizer.reportSections);

  const preferred = organizer.user?.locale ?? "fr";
  const locale = preferred in MESSAGES ? preferred : "fr";
  const t = createTranslator({
    locale,
    messages: byLocale(MESSAGES, locale),
    namespace: "organizerReport",
  });
  const intl = intlLocale(locale);
  const money = (cents: number) => (cents > 0 ? formatPrice(cents, intl) : "–");
  const format = (date: Date, style: "day" | "session" | "since") =>
    new Intl.DateTimeFormat(intl, {
      timeZone: EVENT_TIME_ZONE,
      ...(style === "day"
        ? { day: "numeric", month: "long", year: "numeric" }
        : style === "session"
          ? { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
          : { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }),
    }).format(date);

  const now = new Date();
  const since = reportSince(organizer.lastReportSentAt, now);
  const { sessions, totals } = await getOrganizerReport(organizerId, { since, now });
  const label = (s: (typeof sessions)[number]) =>
    `${tr(s.eventTitle as Translated, locale)} — ${format(s.startsAt, "session")}`;

  const tables: ReportTable[] = [];
  const summary: { label: string; value: string }[] = [];
  if (sections.includes("sales")) {
    tables.push({
      title: t("salesTitle"),
      columns: [t("date"), t("sold"), t("soldNew"), t("revenue"), t("pending")],
      rows: sessions.map((s) => [
        label(s),
        String(s.sold),
        s.soldNew > 0 ? `+${s.soldNew}` : "–",
        money(s.revenueCents),
        s.pending > 0 ? String(s.pending) : "–",
      ]),
      empty: t("empty"),
    });
    summary.push(
      { label: t("sold"), value: String(totals.sold) },
      { label: t("soldNewSince", { date: format(since, "since") }), value: String(totals.soldNew) },
      { label: t("revenue"), value: money(totals.revenueCents) },
      ...(totals.revenueResellerCents > 0
        ? [{ label: t("revenueReseller"), value: money(totals.revenueResellerCents) }]
        : []),
      ...(totals.pending > 0 ? [{ label: t("pending"), value: String(totals.pending) }] : []),
    );
  }
  if (sections.includes("invitations")) {
    tables.push({
      title: t("invitationsTitle"),
      columns: [t("date"), t("guestHeld"), t("offered"), t("paid"), t("paidAmount")],
      rows: sessions.map((s) => [
        label(s),
        String(s.guestHeld),
        String(s.offered),
        String(s.paid),
        money(s.paidCents),
      ]),
      empty: t("empty"),
    });
    summary.push(
      { label: t("guestHeld"), value: String(totals.guestHeld) },
      { label: t("offered"), value: String(totals.offered) },
      { label: t("paid"), value: String(totals.paid) },
      ...(totals.paidCents > 0 ? [{ label: t("paidAmount"), value: money(totals.paidCents) }] : []),
    );
  }
  if (sections.includes("remaining")) {
    tables.push({
      title: t("remainingTitle"),
      columns: [t("date"), t("onSale")],
      rows: sessions.map((s) => [label(s), String(s.onSale)]),
      empty: t("empty"),
    });
    summary.push({ label: t("onSale"), value: String(totals.onSale) });
  }

  const [first, ...bcc] = to;
  const result = await sendTableReportEmail(
    {
      to: first!,
      bcc,
      subject: t("subject", { name: organizer.name, date: format(now, "day") }),
      heading: t("heading", { name: organizer.name }),
      period: t("asOf", { date: format(now, "day") }),
      tables,
      summaryTitle: t("totals"),
      summary,
      footer: [
        ...(sections.includes("sales") ? [t("footerSales")] : []),
        ...(sections.includes("invitations") ? [t("footerInvitations")] : []),
      ].join(" "),
      url: `${publicAppOrigin()}/${locale}/admin/reports`,
      button: t("open"),
    },
    "rapport organisateur",
  );
  if (result.sent) {
    await prisma.organizer.update({
      where: { id: organizerId },
      data: { lastReportSentAt: now },
    });
  }
  return result.sent;
}

/** Passe du planificateur : un rapport par période close, une seule fois. */
export async function sendDueOrganizerReports(now = new Date()): Promise<number> {
  const organizers = await prisma.organizer.findMany({
    where: { reportFrequency: { in: ["DAILY", "WEEKLY"] } },
    select: { id: true, reportFrequency: true, lastReportAt: true },
  });
  let n = 0;
  for (const organizer of organizers) {
    const period = lastClosedPeriod(organizer.reportFrequency as "DAILY" | "WEEKLY", now);
    if (!period) continue;
    if (organizer.lastReportAt && organizer.lastReportAt >= period.to) continue;
    // Réservé avant l'envoi : deux instances ne l'envoient pas deux fois.
    const { count } = await prisma.organizer.updateMany({
      where: {
        id: organizer.id,
        OR: [{ lastReportAt: null }, { lastReportAt: { lt: period.to } }],
      },
      data: { lastReportAt: period.to },
    });
    if (count !== 1) continue;
    try {
      if (await sendOrganizerReport(organizer.id)) n += 1;
    } catch (error) {
      console.error("[rapports] envoi impossible", organizer.id, error);
    }
  }
  return n;
}

const INTERVAL_MS = 15 * 60 * 1000;
let started = false;
let running = false;

export function startOrganizerReports(): void {
  if (started) return;
  started = true;
  const pass = async () => {
    if (running) return;
    running = true;
    try {
      const n = await sendDueOrganizerReports();
      if (n > 0) console.log(`[rapports] ${n} rapport(s) envoyé(s)`);
    } catch (error) {
      console.error("[rapports] planificateur", error);
    } finally {
      running = false;
    }
  };
  setTimeout(() => void pass(), 90 * 1000).unref();
  setInterval(() => void pass(), INTERVAL_MS).unref();
}
