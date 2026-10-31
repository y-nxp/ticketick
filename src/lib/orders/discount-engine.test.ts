import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeDiscounts,
  ticketRevenueCents,
  type EngineDiscount,
  type EngineLine,
} from "./discount-engine";

const ORG = "illyria";
const ROUGEMONT = "rougemont";
const SAANEN = "saanen";

const base = {
  label: {},
  type: "PERCENTAGE" as const,
  organizerId: ORG,
  venueId: null,
  minDistinctSessions: null,
  minQuantity: null,
  minAmountCents: null,
  maxRedemptions: null,
  redemptions: 0,
};
const multi: EngineDiscount = {
  ...base,
  id: "multi",
  kind: "sessions",
  value: 1500,
  venueId: ROUGEMONT,
  minDistinctSessions: 3,
};
const group10: EngineDiscount = { ...base, id: "g10", kind: "group", value: 1000, minQuantity: 8 };
const group15: EngineDiscount = { ...base, id: "g15", kind: "group", value: 1500, minQuantity: 11 };
const ALL = [multi, group10, group15];

function seats(event: string, quantity: number, price: number, venue = ROUGEMONT): EngineLine {
  return {
    quantity,
    unitPriceCents: price * 100,
    sessionId: `s-${event}`,
    eventId: event,
    venueId: venue,
    organizerId: ORG,
  };
}
function youth(event: string, regularPrices: number[], venue = ROUGEMONT): EngineLine {
  return {
    ...seats(event, regularPrices.length, 0, venue),
    companionRegularCents: regularPrices.map((p) => p * 100),
  };
}
function total(lines: EngineLine[]) {
  return lines.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0);
}
function check(lines: EngineLine[], discounts = ALL) {
  const r = computeDiscounts(lines, discounts);
  assert.equal(
    r.perLine.reduce((s, c) => s + c, 0),
    r.totalCents,
    "la part des lignes fait le total",
  );
  return r;
}

test("7 places sur un concert : pas de remise", () => {
  assert.equal(check([seats("oropesa", 7, 200)]).totalCents, 0);
});

test("8 et 10 places : -10 % ; 11 places : -15 %", () => {
  const r8 = check([seats("oropesa", 8, 200)]);
  assert.equal(r8.totalCents, 16000);
  assert.deepEqual(r8.applied.map((a) => a.discountId), ["g10"]);
  assert.equal(check([seats("oropesa", 10, 200)]).totalCents, 20000);
  const r11 = check([seats("oropesa", 11, 200)]);
  assert.equal(r11.totalCents, 33000);
  assert.deepEqual(r11.applied.map((a) => a.discountId), ["g15"]);
});

test("les places comptent toutes catégories confondues, au prix de chacune", () => {
  const r = check([seats("oropesa", 4, 250), seats("oropesa", 4, 90)]);
  assert.equal(r.totalCents, 13600);
  assert.deepEqual(r.perLine, [10000, 3600]);
});

test("5 places sur un concert et 5 sur un autre : pas de remise de groupe", () => {
  assert.equal(check([seats("oropesa", 5, 200), seats("grigolo", 5, 200)]).totalCents, 0);
});

test("deux concerts au même palier : une seule ligne de remise, montants additionnés", () => {
  const r = check([seats("oropesa", 8, 200), seats("grigolo", 9, 100)]);
  assert.equal(r.applied.length, 1);
  assert.equal(r.totalCents, 16000 + 9000);
  assert.deepEqual(r.perLine, [16000, 9000]);
});

test("billets gratuits exclus : concert gratuit et gratuités ne comptent pas comme payants", () => {
  const free = { ...seats("concert-1er-janvier", 6, 0), sessionId: "s-free" };
  assert.equal(check([seats("oropesa", 7, 200), { ...free, eventId: "oropesa" }]).totalCents, 0);
});

test("3 concerts à Rougemont et un groupe : une seule remise, le multi-concerts s'il rapporte plus", () => {
  const lines = [seats("oropesa", 8, 200), seats("grigolo", 1, 200), seats("spyres", 1, 200)];
  const r = check(lines);
  assert.deepEqual(r.applied.map((a) => a.discountId), ["multi"]);
  assert.equal(r.totalCents, 30000);
});

test("3 concerts à Rougemont et un groupe : une seule remise, le groupe s'il rapporte plus", () => {
  const lines = [
    seats("pagano", 11, 120, SAANEN),
    seats("oropesa", 1, 50),
    seats("grigolo", 1, 50),
    seats("spyres", 1, 50),
  ];
  const r = check(lines);
  assert.deepEqual(r.applied.map((a) => a.discountId), ["g15"]);
  assert.equal(r.totalCents, 19800);
  assert.deepEqual(r.perLine, [19800, 0, 0, 0]);
});

test("gratuités -25 ans et 8 places payantes : la gratuité reste, pas de remise de groupe", () => {
  const lines = [seats("oropesa", 8, 90), youth("oropesa", [90, 90])];
  const r = check(lines);
  assert.equal(r.totalCents, 0);
  assert.equal(total(lines) - r.totalCents, 72000);
});

test("gratuités -25 ans : la remise de groupe gagne quand elle coûte moins que la gratuité", () => {
  // 10 payantes + 1 gratuité : garder la gratuité = 900 fr. ; la remise sur
  // 11 places au plein tarif = 990 − 15 % = 841.50 fr. à payer.
  const lines = [seats("oropesa", 10, 90), youth("oropesa", [90])];
  const r = check(lines);
  assert.deepEqual(r.applied.map((a) => [a.discountId, a.waivesCompanions]), [["g15", true]]);
  assert.equal(total(lines) - r.totalCents, 84150);
  assert.deepEqual(r.perLine, [5850, 0]);
});

test("gratuité sur un autre concert : sans effet sur la remise de ce concert", () => {
  const r = check([seats("oropesa", 8, 200), seats("grigolo", 1, 90), youth("grigolo", [90, 90])]);
  assert.deepEqual(r.applied.map((a) => [a.discountId, a.amountCents]), [["g10", 16000]]);
});

test("concert exclu par l'organisateur : pas de remise de groupe", () => {
  const off = { ...seats("oropesa", 11, 200), groupDiscountOff: true };
  assert.equal(check([off]).totalCents, 0);
});

test("autre organisateur : ses paliers ne s'appliquent pas", () => {
  assert.equal(check([{ ...seats("autre", 11, 200), organizerId: "autre-org" }]).totalCents, 0);
});

test("sans palier configuré : le multi-concerts seul, comme avant", () => {
  const lines = [seats("oropesa", 1, 200), seats("grigolo", 1, 200), seats("spyres", 1, 100)];
  assert.equal(check(lines, [multi]).totalCents, 7500);
});

test("rapport : la remise de groupe ne baisse que la recette de son concert", () => {
  const order = {
    subtotalCents: 8 * 20000 + 10000,
    discountCents: 16000,
    items: [
      { ticketTypeId: "oropesa-cat1", unitPriceCents: 20000, quantity: 8, discountCents: 16000 },
      { ticketTypeId: "grigolo-cat1", unitPriceCents: 10000, quantity: 1, discountCents: 0 },
    ],
  };
  assert.equal(ticketRevenueCents(order, "oropesa-cat1"), 18000);
  assert.equal(ticketRevenueCents(order, "grigolo-cat1"), 10000);
});

test("rapport : commande antérieure sans part par ligne, répartition au prorata", () => {
  const order = {
    subtotalCents: 20000,
    discountCents: 3000,
    items: [{ ticketTypeId: "a", unitPriceCents: 10000, quantity: 2, discountCents: 0 }],
  };
  assert.equal(ticketRevenueCents(order, "a"), 8500);
});
