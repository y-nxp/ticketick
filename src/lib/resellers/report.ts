import "server-only";

import { createTranslator } from "next-intl";
import de from "../../../messages/de.json";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import it from "../../../messages/it.json";
import { publicAppOrigin } from "@/lib/app-url";
import { sendResellerReportEmail } from "@/lib/email";
import { byLocale, intlLocale } from "@/lib/i18n-fallback";
import { prisma } from "@/lib/prisma";
import { t as tr, type Translated } from "@/lib/types";
import { EVENT_TIME_ZONE, formatPrice } from "@/lib/utils";
import { resellerStats, type PosStats } from "./stats";

/**
 * Récapitulatif des ventes d'un point de vente, quotidien ou hebdomadaire :
 * au point de vente (adresse principale et copies), et à l'organisateur s'il
 * le souhaite, limité à ses propres spectacles.
 */

const MESSAGES = { fr, en, de, it };
/** Heure d'envoi, la période close : la veille ou la semaine passée. */
const SEND_HOUR = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function zoned(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: EVENT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    h: Number(get("hour")),
    mi: Number(get("minute")),
    s: Number(get("second")),
    weekday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")),
  };
}

function offsetMs(date: Date): number {
  const p = zoned(date);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(date.getTime() / 1000) * 1000;
}

/** Minuit à Zurich du jour (local) de `date`, décalé de `days` jours (ou `hour` heures ce jour-là). */
export function localMidnight(date: Date, days = 0, hour = 0): Date {
  const p = zoned(date);
  const guess = Date.UTC(p.y, p.m - 1, p.d + days, hour);
  let time = guess - offsetMs(new Date(guess));
  const corrected = guess - offsetMs(new Date(time));
  if (corrected !== time) time = corrected;
  return new Date(time);
}

/** Jour (1 = lundi … 7 = dimanche, pour l'hebdomadaire) et heure d'envoi, à Zurich. */
export interface ReportSchedule {
  weekday: number;
  hour: number;
}

const DEFAULT_SCHEDULE: ReportSchedule = { weekday: 1, hour: SEND_HOUR };

/** Minuit du jour d'envoi le plus récent : aujourd'hui, ou le dernier jour choisi. */
function lastBoundary(frequency: "DAILY" | "WEEKLY", now: Date, schedule: ReportSchedule): Date {
  if (frequency === "DAILY") return localMidnight(now);
  return localMidnight(now, -((zoned(now).weekday + 1 - schedule.weekday + 7) % 7));
}

const sendTime = (boundary: Date, schedule: ReportSchedule) =>
  localMidnight(boundary, 0, schedule.hour);

/** Fin de la dernière période close, si l'heure d'envoi est passée. */
export function lastClosedPeriod(
  frequency: "DAILY" | "WEEKLY",
  now: Date,
  schedule: ReportSchedule = DEFAULT_SCHEDULE,
): { from: Date; to: Date } | null {
  const to = lastBoundary(frequency, now, schedule);
  if (now < sendTime(to, schedule)) return null;
  const from = frequency === "DAILY" ? localMidnight(to, -1) : localMidnight(to, -7);
  return { from, to };
}

/** Heure du prochain récapitulatif automatique, au plus tôt maintenant. */
export function nextReportAt(
  frequency: "DAILY" | "WEEKLY",
  lastReportAt: Date | null,
  now = new Date(),
  schedule: ReportSchedule = DEFAULT_SCHEDULE,
): Date {
  const closed = lastClosedPeriod(frequency, now, schedule);
  if (closed && (!lastReportAt || lastReportAt < closed.to)) return now;
  const current = lastBoundary(frequency, now, schedule);
  if (now < sendTime(current, schedule) && (!lastReportAt || lastReportAt < current)) {
    return sendTime(current, schedule);
  }
  return sendTime(localMidnight(current, frequency === "DAILY" ? 1 : 7), schedule);
}

export async function sendResellerReport(
  resellerId: string,
  period: { from: Date; to: Date },
): Promise<{ sent: number }> {
  const reseller = await prisma.reseller.findUnique({
    where: { id: resellerId },
    select: {
      id: true,
      name: true,
      email: true,
      notifyEmails: true,
      locale: true,
      organizerId: true,
      reportCopyOrganizer: true,
      events: { select: { event: { select: { organizerId: true } } } },
    },
  });
  if (!reseller) return { sent: 0 };

  let sent = 0;
  const own = [...new Set([reseller.email, ...reseller.notifyEmails].filter(Boolean))];
  if (own.length > 0) {
    const ok = await mailReport({
      recipients: own,
      locale: reseller.locale,
      resellerId: reseller.id,
      resellerName: reseller.name,
      organizerId: null,
      period,
      url: `${publicAppOrigin()}/${reseller.locale}/pos`,
      audience: "pos",
    });
    if (ok) sent += 1;
  }

  if (reseller.reportCopyOrganizer) {
    const organizerIds = reseller.organizerId
      ? [reseller.organizerId]
      : [...new Set(reseller.events.map((e) => e.event.organizerId))];
    const organizers = await prisma.organizer.findMany({
      where: { id: { in: organizerIds } },
      select: { id: true, notifyEmails: true, user: { select: { locale: true } } },
    });
    for (const organizer of organizers) {
      const recipients = organizer.notifyEmails.filter((a) => !own.includes(a));
      if (recipients.length === 0) continue;
      const locale = organizer.user?.locale ?? "fr";
      const ok = await mailReport({
        recipients,
        locale,
        resellerId: reseller.id,
        resellerName: reseller.name,
        // Point de vente partagé : chaque organisateur ne voit que ses spectacles.
        organizerId: reseller.organizerId ? null : organizer.id,
        period,
        url: `${publicAppOrigin()}/${locale}/admin/resellers/${reseller.id}`,
        audience: "organizer",
      });
      if (ok) sent += 1;
    }
  }
  return { sent };
}

async function mailReport(input: {
  recipients: string[];
  locale: string;
  resellerId: string;
  resellerName: string;
  organizerId: string | null;
  period: { from: Date; to: Date };
  url: string;
  audience: "pos" | "organizer";
}): Promise<boolean> {
  const locale = input.locale in MESSAGES ? input.locale : "fr";
  const t = createTranslator({
    locale,
    messages: byLocale(MESSAGES, locale),
    namespace: "posReport",
  });
  const intl = intlLocale(locale);
  const money = (cents: number) => formatPrice(cents, intl);
  const day = (date: Date) =>
    new Intl.DateTimeFormat(intl, {
      timeZone: EVENT_TIME_ZONE,
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);

  const [inPeriod, overall]: PosStats[] = await Promise.all([
    resellerStats(input.resellerId, {
      organizerId: input.organizerId,
      from: input.period.from,
      to: input.period.to,
    }),
    resellerStats(input.resellerId, { organizerId: input.organizerId, to: input.period.to }),
  ]);

  const lastDay = new Date(input.period.to.getTime() - 1);
  const oneDay = input.period.to.getTime() - input.period.from.getTime() <= DAY_MS + 60 * 60 * 1000;
  const periodLabel = oneDay
    ? t("periodDay", { date: day(input.period.from) })
    : t("periodRange", { from: day(input.period.from), to: day(lastDay) });

  const p = inPeriod.totals;
  const o = overall.totals;
  const [to, ...bcc] = input.recipients;
  const result = await sendResellerReportEmail({
    to: to!,
    bcc,
    subject: t("subject", { name: input.resellerName, period: periodLabel }),
    heading: input.resellerName,
    period: periodLabel,
    tables: [
      {
        columns: [t("show"), t("tickets"), t("amount"), t("commission")],
        rows: inPeriod.events
          .filter((e) => e.tickets > 0 || e.pendingTickets > 0)
          .map((e) => [
            tr(e.title as Translated, locale),
            String(e.tickets),
            money(e.amountCents),
            money(e.commissionCents),
          ]),
        empty: t("empty"),
      },
    ],
    summaryTitle: t("periodTitle"),
    summary: [
      { label: t("tickets"), value: String(p.tickets) },
      { label: t("cash"), value: money(p.cashCents) },
      { label: t("terminal"), value: money(p.terminalCents) },
      { label: t("online"), value: money(p.onlineCents) },
      { label: t("commission"), value: money(p.commissionCents) },
      { label: t("overallTickets"), value: String(o.tickets) },
      { label: t("overallCommission"), value: money(o.commissionCents) },
      {
        label: overall.balanceCents < 0 ? t("balanceOwed") : t("balanceDue"),
        value: money(Math.abs(overall.balanceCents)),
      },
    ],
    footer: t("footer"),
    link: { url: input.url, button: input.audience === "pos" ? t("openPos") : t("openAdmin") },
  });
  return result.sent;
}

/** Passe du planificateur : un récapitulatif par période close, une seule fois. */
export async function sendDueResellerReports(now = new Date()): Promise<number> {
  const resellers = await prisma.reseller.findMany({
    where: { active: true, reportFrequency: { in: ["DAILY", "WEEKLY"] } },
    select: { id: true, reportFrequency: true, lastReportAt: true },
  });
  let n = 0;
  for (const reseller of resellers) {
    const period = lastClosedPeriod(reseller.reportFrequency as "DAILY" | "WEEKLY", now);
    if (!period) continue;
    if (reseller.lastReportAt && reseller.lastReportAt >= period.to) continue;
    // Réservé avant l'envoi : deux instances ne l'envoient pas deux fois.
    const { count } = await prisma.reseller.updateMany({
      where: {
        id: reseller.id,
        OR: [{ lastReportAt: null }, { lastReportAt: { lt: period.to } }],
      },
      data: { lastReportAt: period.to },
    });
    if (count !== 1) continue;
    try {
      await sendResellerReport(reseller.id, period);
      n += 1;
    } catch (error) {
      console.error("[points de vente] récapitulatif impossible", reseller.id, error);
    }
  }
  return n;
}

const INTERVAL_MS = 15 * 60 * 1000;
let started = false;
let running = false;

export function startResellerReports(): void {
  if (started) return;
  started = true;
  const pass = async () => {
    if (running) return;
    running = true;
    try {
      const n = await sendDueResellerReports();
      if (n > 0) console.log(`[points de vente] ${n} récapitulatif(s) envoyé(s)`);
    } catch (error) {
      console.error("[points de vente] planificateur", error);
    } finally {
      running = false;
    }
  };
  setTimeout(() => void pass(), 60 * 1000).unref();
  setInterval(() => void pass(), INTERVAL_MS).unref();
}
