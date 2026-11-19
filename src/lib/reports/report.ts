import "server-only";

import type { Prisma } from "@prisma/client";
import { createTranslator } from "next-intl";
import de from "../../../messages/de.json";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import it from "../../../messages/it.json";
import { sendTableReportEmail, type ReportTable } from "@/lib/email";
import { byLocale, intlLocale } from "@/lib/i18n-fallback";
import { prisma } from "@/lib/prisma";
import { lastClosedPeriod } from "@/lib/resellers/report";
import { t as tr, type Translated } from "@/lib/types";
import { EVENT_TIME_ZONE, formatPrice } from "@/lib/utils";
import { loadActiveCampaignFigures } from "@/lib/promotion/results-store";
import {
  hourWindow,
  morningHeadline,
  morningWindow,
  titleList,
  zurichDay,
} from "./event-schedule";
import { promotionReportBlock } from "./promotion-section";
import { getOrganizerReport, readSections, type ReportSection } from "./summary";

/**
 * Rapport d'un organisateur : ventes, invitations et places restantes des
 * dates à venir, et résultats de ses campagnes actives (partie « Promotion »,
 * facultative), selon les parties choisies. Envoyé à la demande, ou chaque
 * jour ou chaque semaine au jour et à l'heure choisis. Les « nouveaux » billets comptent depuis le rapport automatique
 * précédent ; un envoi à la demande ne déplace pas ce point de départ.
 */

const MESSAGES = { fr, en, de, it };
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function reportRecipients(organizer: {
  reportEmails: string[];
  notifyEmails: string[];
}): string[] {
  return organizer.reportEmails.length > 0 ? organizer.reportEmails : organizer.notifyEmails;
}

/** Début des « nouveaux » : le rapport automatique précédent, sinon une semaine. */
export function reportSince(lastSentAt: Date | null, now = new Date()): Date {
  return lastSentAt ?? new Date(now.getTime() - WEEK_MS);
}

export async function sendOrganizerReport(
  organizerId: string,
  options: {
    recipients?: string[];
    sections?: ReportSection[];
    /** Envoi du planificateur : début de la période si aucun rapport automatique n'est encore parti. */
    period?: { from: Date };
    /**
     * Rapport d'événement : seulement ces dates, « nouveaux » sur 24 heures,
     * sans toucher au point de départ du rapport périodique.
     */
    event?: { kind: "morning" | "hour"; sessionIds: string[] };
    /** Instant de la passe du planificateur (tests : une heure simulée). */
    now?: Date;
  } = {},
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
  const event = options.event;
  const sections = (options.sections ?? readSections(organizer.reportSections)).filter(
    (s) => !event || s !== "promotion",
  );

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

  const now = options.now ?? new Date();
  const since = event
    ? new Date(now.getTime() - 24 * 60 * 60 * 1000)
    : options.period && !organizer.lastReportSentAt
      ? options.period.from
      : reportSince(organizer.lastReportSentAt, now);
  const { sessions, totals } = await getOrganizerReport(organizerId, {
    since,
    now,
    locale,
    sessionIds: event?.sessionIds,
  });
  // Dates annulées ou passées entre-temps : rien à annoncer.
  if (event && sessions.length === 0) return false;
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
    // Options (navette…) : un tableau par option et par date, pour préparer le service.
    for (const s of sessions) {
      for (const option of s.options) {
        const count = (n: number) => (n > 0 ? String(n) : "–");
        tables.push({
          title: `${t("optionsTitle")} — ${option.title} · ${label(s)}`,
          columns: [t("optionsChoice"), t("optionsPeople"), t("optionsOrders")],
          rows: [
            ...option.groups.flatMap((g) =>
              g.choices.map((c) => [[g.title, c.label].filter(Boolean).join(" : "), count(c.people), count(c.orders)]),
            ),
            ...option.other.map((c) => [c.label, count(c.people), count(c.orders)]),
            [t("optionsTotal"), String(option.people), String(option.orders)],
          ],
          empty: t("empty"),
        });
      }
    }
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
  const promotion = sections.includes("promotion")
    ? promotionReportBlock(
        sections,
        (await loadActiveCampaignFigures(organizerId)).map((c) => ({
          name: c.name,
          eventTitle: tr(c.event.title as Translated, locale),
          figures: c.figures,
        })),
        t,
        money,
      )
    : null;
  if (promotion) {
    tables.push(promotion.table);
    summary.push(...promotion.summary);
  }

  const titles = (list: typeof sessions) => titleList(list.map((s) => tr(s.eventTitle as Translated, locale)));
  const headline = event?.kind === "morning" ? morningHeadline(zurichDay(now), sessions) : null;
  const subject = !event
    ? t("subject", { name: organizer.name, date: format(now, "day") })
    : event.kind === "hour"
      ? t("eventSubjectHour", { events: titles(sessions), name: organizer.name })
      : headline && headline.days > 0
        ? t("eventSubjectSoon", { days: headline.days, events: titles(headline.sessions), name: organizer.name })
        : t("eventSubjectToday", { events: titles(headline?.sessions ?? sessions), name: organizer.name });

  const [first, ...bcc] = to;
  const result = await sendTableReportEmail(
    {
      to: first!,
      bcc,
      subject,
      heading: t("heading", { name: organizer.name }),
      period: event ? t("asOf", { date: format(now, "since") }) : t("asOf", { date: format(now, "day") }),
      tables,
      summaryTitle: event ? t("eventTotals") : t("totals"),
      summary,
      footer: [
        ...(sections.includes("sales") ? [t("footerSales")] : []),
        ...(sections.includes("sales") && sessions.some((s) => s.options.length > 0)
          ? [t("footerOptions")]
          : []),
        ...(sections.includes("invitations") ? [t("footerInvitations")] : []),
        ...(promotion ? [promotion.footer] : []),
      ].join(" "),
    },
    event ? "rapport d'événement" : "rapport organisateur",
  );
  if (result.sent && options.period) {
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
    select: {
      id: true,
      reportFrequency: true,
      reportWeekday: true,
      reportHour: true,
      lastReportAt: true,
    },
  });
  let n = 0;
  for (const organizer of organizers) {
    const period = lastClosedPeriod(organizer.reportFrequency as "DAILY" | "WEEKLY", now, {
      weekday: organizer.reportWeekday,
      hour: organizer.reportHour,
    });
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
      if (await sendOrganizerReport(organizer.id, { period })) n += 1;
    } catch (error) {
      console.error("[rapports] envoi impossible", organizer.id, error);
    }
  }
  return n;
}

const LIVE_EVENT: Prisma.EventWhereInput = { status: { in: ["PUBLISHED", "SOLD_OUT"] } };

/**
 * Passe des rapports d'événement : le rapport du matin (7 h, semaine qui
 * précède une date et jour même) et celui d'une heure avant le début. Chaque
 * envoi est réservé en base avant de partir : deux instances ne l'envoient
 * pas deux fois.
 */
export async function sendDueEventReports(now = new Date()): Promise<number> {
  let n = 0;
  const send = async (organizerId: string, event: { kind: "morning" | "hour"; sessionIds: string[] }) => {
    try {
      if (await sendOrganizerReport(organizerId, { event, now })) n += 1;
    } catch (error) {
      console.error("[rapports] rapport d'événement impossible", organizerId, error);
    }
  };

  const organizers = await prisma.organizer.findMany({
    where: { eventReports: true },
    select: { id: true, lastEventReportDay: true },
  });
  for (const organizer of organizers) {
    const window = morningWindow(now, organizer.lastEventReportDay);
    if (!window) continue;
    const { count } = await prisma.organizer.updateMany({
      where: {
        id: organizer.id,
        OR: [{ lastEventReportDay: null }, { lastEventReportDay: { not: window.day } }],
      },
      data: { lastEventReportDay: window.day },
    });
    if (count !== 1) continue;
    const sessions = await prisma.eventSession.findMany({
      where: {
        startsAt: { gte: window.from, lt: window.to },
        status: { not: "CANCELLED" },
        event: { ...LIVE_EVENT, organizerId: organizer.id },
      },
      select: { id: true },
    });
    if (sessions.length > 0) await send(organizer.id, { kind: "morning", sessionIds: sessions.map((s) => s.id) });
  }

  const hour = hourWindow(now);
  const starting = await prisma.eventSession.findMany({
    where: {
      startsAt: { gt: hour.from, lte: hour.to },
      hourReportAt: null,
      status: { not: "CANCELLED" },
      event: { ...LIVE_EVENT, organizer: { eventReports: true } },
    },
    select: { id: true, event: { select: { organizerId: true } } },
  });
  const byOrganizer = new Map<string, string[]>();
  for (const s of starting) {
    const { count } = await prisma.eventSession.updateMany({
      where: { id: s.id, hourReportAt: null },
      data: { hourReportAt: now },
    });
    if (count !== 1) continue;
    byOrganizer.set(s.event.organizerId, [...(byOrganizer.get(s.event.organizerId) ?? []), s.id]);
  }
  for (const [organizerId, sessionIds] of byOrganizer) await send(organizerId, { kind: "hour", sessionIds });
  return n;
}

const INTERVAL_MS = 15 * 60 * 1000;
/** Rapports d'événement : toutes les 5 minutes, pour tenir « une heure avant ». */
const EVENT_INTERVAL_MS = 5 * 60 * 1000;
let started = false;
let running = false;
let eventRunning = false;

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
  const eventPass = async () => {
    if (eventRunning) return;
    eventRunning = true;
    try {
      const n = await sendDueEventReports();
      if (n > 0) console.log(`[rapports] ${n} rapport(s) d'événement envoyé(s)`);
    } catch (error) {
      console.error("[rapports] rapports d'événement", error);
    } finally {
      eventRunning = false;
    }
  };
  setTimeout(() => void pass(), 90 * 1000).unref();
  setInterval(() => void pass(), INTERVAL_MS).unref();
  setTimeout(() => void eventPass(), 2 * 60 * 1000).unref();
  setInterval(() => void eventPass(), EVENT_INTERVAL_MS).unref();
}
