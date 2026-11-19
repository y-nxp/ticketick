import { test } from "node:test";
import assert from "node:assert/strict";
import { dayDiff, hourWindow, morningHeadline, morningWindow, titleList, zurichDay } from "./event-schedule";

test("morning report runs from 7:00 to noon, once a day (Zurich time)", () => {
  // 27 décembre, heure d'hiver : 06:00 UTC = 07:00 à Zurich.
  assert.equal(morningWindow(new Date("2026-12-27T05:59:00Z"), null), null);
  const w = morningWindow(new Date("2026-12-27T06:05:00Z"), null);
  assert.ok(w);
  assert.equal(w.day, "2026-12-27");
  // Fin du septième jour : 4 janvier à minuit, heure suisse.
  assert.equal(w.to.toISOString(), "2027-01-03T23:00:00.000Z");
  assert.equal(morningWindow(new Date("2026-12-27T06:05:00Z"), "2026-12-27"), null);
  assert.ok(morningWindow(new Date("2026-12-28T06:05:00Z"), "2026-12-27"));
  assert.equal(morningWindow(new Date("2026-12-27T11:00:00Z"), null), null);
  // Heure d'été : 05:00 UTC = 07:00.
  assert.ok(morningWindow(new Date("2026-07-01T05:00:00Z"), null));
});

test("hour window covers the next sixty minutes", () => {
  const now = new Date("2026-12-27T17:00:00Z");
  const w = hourWindow(now);
  assert.equal(w.to.getTime() - w.from.getTime(), 3_600_000);
});

test("headline picks today's dates, else the nearest day", () => {
  const today = "2026-12-27";
  const s = (iso: string, title: string) => ({ startsAt: new Date(iso), title });
  const sameDay = morningHeadline(today, [s("2026-12-27T18:00:00Z", "Arias"), s("2026-12-29T18:00:00Z", "Tango")]);
  assert.equal(sameDay?.days, 0);
  assert.deepEqual(sameDay?.sessions.map((x) => x.title), ["Arias"]);

  const later = morningHeadline(today, [
    s("2027-01-02T18:00:00Z", "Duos"),
    s("2026-12-30T15:00:00Z", "Piano"),
    s("2026-12-30T18:00:00Z", "Romantissimo"),
  ]);
  assert.equal(later?.days, 3);
  assert.deepEqual(later?.sessions.map((x) => x.title), ["Piano", "Romantissimo"]);
  assert.equal(morningHeadline(today, []), null);
});

test("late evening in UTC is already the next Zurich day", () => {
  assert.equal(zurichDay(new Date("2026-12-31T23:30:00Z")), "2027-01-01");
  assert.equal(dayDiff("2026-12-31", "2027-01-01"), 1);
});

test("title list removes duplicates and caps at three", () => {
  assert.equal(titleList(["A", "B", "A"]), "A · B");
  assert.equal(titleList(["A", "B", "C", "D", "E"]), "A · B · C +2");
});
