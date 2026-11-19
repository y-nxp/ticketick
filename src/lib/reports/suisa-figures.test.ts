import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSuisaReport,
  csvLine,
  spreadOrderTotal,
  withoutVat,
  type SuisaSessionInput,
} from "./suisa-figures";

const session = (id: string, over: Partial<SuisaSessionInput> = {}): SuisaSessionInput => ({
  sessionId: id,
  eventId: `e-${id}`,
  eventTitle: { fr: id },
  startsAt: new Date("2026-12-27T18:00:00Z"),
  venue: "Église, Rougemont",
  capacity: 300,
  music: "PROTECTED",
  doorTickets: null,
  doorRevenueCents: null,
  ...over,
});

test("paid and free tickets, door sales and totals per concert", () => {
  const report = buildSuisaReport(
    [
      session("arias", { music: "PUBLIC_DOMAIN", startsAt: new Date("2026-12-27T18:00:00Z") }),
      session("tenebrae", { startsAt: new Date("2026-12-28T18:00:00Z"), doorTickets: 4, doorRevenueCents: 18_000 }),
      session("talk", { music: "NONE", startsAt: new Date("2026-12-29T10:00:00Z") }),
    ],
    [
      { sessionId: "arias", revenueCents: 12_000 },
      { sessionId: "arias", revenueCents: 10_200 },
      { sessionId: "arias", revenueCents: 0 },
      { sessionId: "tenebrae", revenueCents: 9_000 },
      { sessionId: "talk", revenueCents: 2_000 },
    ],
    new Map([["tenebrae", 2]]),
    0,
  );

  const [arias, tenebrae, talk] = report.rows;
  assert.equal(arias!.paid, 2);
  assert.equal(arias!.offered, 1);
  assert.equal(arias!.tickets, 3);
  assert.equal(arias!.grossCents, 22_200);
  assert.equal(tenebrae!.paidTotal, 5);
  assert.equal(tenebrae!.grossCents, 27_000);
  assert.equal(tenebrae!.pending, 2);
  assert.equal(talk!.grossCents, 2_000);

  // Hors tarif K : la conférence ne compte pas dans les totaux.
  assert.equal(report.totals.sessions, 2);
  assert.equal(report.totals.paidTotal, 7);
  assert.equal(report.totals.offered, 1);
  assert.equal(report.totals.grossCents, 49_200);
  assert.equal(report.protectedTotals.sessions, 1);
  assert.equal(report.protectedTotals.grossCents, 27_000);
  assert.equal(report.unmarked, 0);
});

test("sessions are sorted by date and unmarked music is counted", () => {
  const report = buildSuisaReport(
    [
      session("late", { startsAt: new Date("2027-01-05T18:00:00Z"), music: null }),
      session("early", { startsAt: new Date("2026-12-27T18:00:00Z") }),
    ],
    [],
    new Map(),
    0,
  );
  assert.deepEqual(report.rows.map((r) => r.sessionId), ["early", "late"]);
  assert.equal(report.unmarked, 1);
  assert.equal(report.totals.sessions, 2);
  assert.equal(report.protectedTotals.sessions, 1);
});

test("large concert: capacity from 1000 or more than CHF 22'000 excluding VAT", () => {
  const big = buildSuisaReport([session("hall", { capacity: 1000 })], [], new Map(), 0);
  assert.equal(big.rows[0]!.large, true);

  const exactly = buildSuisaReport(
    [session("a")],
    [{ sessionId: "a", revenueCents: 2_200_000 }],
    new Map(),
    0,
  );
  assert.equal(exactly.rows[0]!.large, false);

  const above = buildSuisaReport(
    [session("a")],
    [{ sessionId: "a", revenueCents: 2_200_100 }],
    new Map(),
    0,
  );
  assert.equal(above.rows[0]!.large, true);

  // Avec 8.1 % de TVA, CHF 23'000 TTC font CHF 21'277 hors TVA : petit concert.
  const withVat = buildSuisaReport(
    [session("a")],
    [{ sessionId: "a", revenueCents: 2_300_000 }],
    new Map(),
    8.1,
  );
  assert.equal(withVat.rows[0]!.baseCents, 2_127_660);
  assert.equal(withVat.rows[0]!.large, false);
});

test("withoutVat leaves amounts untouched when no VAT is due", () => {
  assert.equal(withoutVat(10_810, 0), 10_810);
  assert.equal(withoutVat(10_810, 8.1), 10_000);
});

test("box-office total is spread over tickets and adds up exactly", () => {
  assert.deepEqual(spreadOrderTotal(10_000, [6_000, 6_000, 3_000]), [4_000, 4_000, 2_000]);
  const odd = spreadOrderTotal(10_000, [1, 1, 1]);
  assert.equal(odd.reduce((a, b) => a + b, 0), 10_000);
  assert.deepEqual(spreadOrderTotal(900, [0, 0, 0]), [300, 300, 300]);
  assert.deepEqual(spreadOrderTotal(500, []), []);
});

test("csv cells with separators or quotes are quoted", () => {
  assert.equal(csvLine(["Arias", 77, "Lauenen; Kirche", 'Le "Duo"']), 'Arias;77;"Lauenen; Kirche";"Le ""Duo"""');
});
