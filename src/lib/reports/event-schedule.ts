/**
 * Calendrier des rapports d'événement, en heure suisse.
 *
 * - Chaque matin à 7 h, pendant la semaine qui précède une date et le jour
 *   même : un rapport sur les dates des sept prochains jours.
 * - Une heure avant le début : un rapport sur les dates qui commencent dans
 *   l'heure. Plusieurs dates en même temps partent dans un seul rapport.
 *
 * Partie pure : aucun accès à la base, pour être testée telle quelle.
 */

import { zurichToUtc } from "@/lib/zurich-time";

export const EVENT_REPORT_HOUR = 7;
/** Passé midi, le rapport du matin n'a plus de sens : il attend le lendemain. */
export const EVENT_REPORT_LAST_HOUR = 12;
export const COUNTDOWN_DAYS = 7;
export const HOUR_BEFORE_MS = 60 * 60 * 1000;

/** Jour suisse d'un instant : « 2026-12-27 ». */
export function zurichDay(instant: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Zurich" }).format(instant);
}

function zurichHour(instant: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", hour: "2-digit", hourCycle: "h23" }).format(instant),
  );
}

export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Écart en jours entre deux jours « AAAA-MM-JJ ». */
export function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * Rapport du matin à faire maintenant ? Renvoie le jour et la fenêtre des
 * dates couvertes (de maintenant à la fin du septième jour), sinon null.
 */
export function morningWindow(
  now: Date,
  lastDay: string | null,
): { day: string; from: Date; to: Date } | null {
  const hour = zurichHour(now);
  if (hour < EVENT_REPORT_HOUR || hour >= EVENT_REPORT_LAST_HOUR) return null;
  const day = zurichDay(now);
  if (lastDay === day) return null;
  return { day, from: now, to: zurichToUtc(`${addDays(day, COUNTDOWN_DAYS + 1)}T00:00`) };
}

/** Fenêtre des dates qui commencent dans l'heure. */
export function hourWindow(now: Date): { from: Date; to: Date } {
  return { from: now, to: new Date(now.getTime() + HOUR_BEFORE_MS) };
}

/**
 * Objet du rapport du matin : les dates du jour, sinon celles du jour le plus
 * proche, avec le nombre de jours qui en sépare.
 */
export function morningHeadline<T extends { startsAt: Date }>(
  today: string,
  sessions: T[],
): { days: number; sessions: T[] } | null {
  if (sessions.length === 0) return null;
  const days = Math.min(...sessions.map((s) => dayDiff(today, zurichDay(s.startsAt))));
  return { days, sessions: sessions.filter((s) => dayDiff(today, zurichDay(s.startsAt)) === days) };
}

/** Titres pour l'objet : sans doublon, trois au plus. */
export function titleList(titles: string[], max = 3): string {
  const unique = [...new Set(titles)];
  return unique.length > max
    ? `${unique.slice(0, max).join(" · ")} +${unique.length - max}`
    : unique.join(" · ");
}
