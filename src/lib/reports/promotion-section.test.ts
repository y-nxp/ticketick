import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { emptyFigures } from "@/lib/promotion/results";
import { promotionReportBlock, type PromotionReportRow } from "./promotion-section";
import { chosenSections, DEFAULT_REPORT_SECTIONS, readSections } from "./sections";

/**
 * Partie « Promotion » du rapport courriel : facultative, jamais cochée par
 * défaut, et absente tant que l'organisateur n'a pas de campagne active.
 */

const t = (key: string, values?: { days: number }) => (values ? `${key}:${values.days}` : key);
const money = (cents: number) => (cents > 0 ? `CHF ${(cents / 100).toFixed(2)}` : "–");

const row = (over: Partial<PromotionReportRow["figures"]> = {}): PromotionReportRow => ({
  name: "Printemps",
  eventTitle: "Le Malade imaginaire",
  figures: { ...emptyFigures(), ...over },
});

test("readSections : rien de coché → parties habituelles, sans Promotion", () => {
  assert.deepEqual(readSections([]), [...DEFAULT_REPORT_SECTIONS]);
  assert.deepEqual(readSections(["sales"]), ["sales"]);
  assert.deepEqual(readSections(["sales", "promotion"]), ["sales", "promotion"]);
  // Promotion seule : les parties habituelles restent, Promotion s'y ajoute.
  assert.deepEqual(readSections(["promotion"]), [...DEFAULT_REPORT_SECTIONS, "promotion"]);
  assert.deepEqual(readSections(["inconnue"]), [...DEFAULT_REPORT_SECTIONS]);
});

test("chosenSections : la case cachée ne change pas le choix enregistré", () => {
  // Case proposée : on suit le formulaire.
  assert.deepEqual(chosenSections(["sales", "promotion"], { promotionOffered: true, saved: [] }), [
    "sales",
    "promotion",
  ]);
  assert.deepEqual(chosenSections(["sales"], { promotionOffered: true, saved: ["promotion"] }), ["sales"]);
  // Case cachée (organisateur, ou aucune campagne) : on garde l'enregistré.
  assert.deepEqual(chosenSections(["sales"], { promotionOffered: false, saved: ["sales", "promotion"] }), [
    "sales",
    "promotion",
  ]);
  assert.deepEqual(chosenSections(["sales", "promotion"], { promotionOffered: false, saved: ["sales"] }), [
    "sales",
  ]);
  // Envoi immédiat : demandé, et proposé ou déjà enregistré.
  assert.deepEqual(
    chosenSections(["sales", "promotion"], { promotionOffered: false, saved: ["promotion"], requested: true }),
    ["sales", "promotion"],
  );
  assert.deepEqual(
    chosenSections(["sales", "promotion"], { promotionOffered: false, saved: [], requested: true }),
    ["sales"],
  );
  assert.deepEqual(
    chosenSections(["sales"], { promotionOffered: true, saved: ["promotion"], requested: false }),
    ["sales"],
  );
});

test("pas de partie Promotion sans campagne active, ni si elle n'est pas choisie", () => {
  assert.equal(promotionReportBlock(["sales", "promotion"], [], t, money), null);
  assert.equal(promotionReportBlock(["sales"], [row({ clicks: 3 })], t, money), null);
  assert.equal(promotionReportBlock(readSections([]), [row({ clicks: 3 })], t, money), null);
});

test("une ligne par campagne, totaux des deux lignes séparés", () => {
  const block = promotionReportBlock(
    ["sales", "promotion"],
    [
      row({ clicks: 40, orders: 3, event: { tickets: 5, cents: 15000 }, other: { tickets: 1, cents: 2000 } }),
      row({ clicks: 2, event: { tickets: 0, cents: 0 } }),
    ],
    t,
    money,
  );
  assert.ok(block);
  assert.deepEqual(block.table.rows, [
    ["Printemps — Le Malade imaginaire", "40", "3", "5", "CHF 150.00", "1 · CHF 20.00"],
    ["Printemps — Le Malade imaginaire", "2", "0", "0", "–", "–"],
  ]);
  assert.deepEqual(block.summary, [
    { label: "promotionTotalTickets", value: "5" },
    { label: "promotionTotalRevenue", value: "CHF 150.00" },
    { label: "promotionTotalOther", value: "1 · CHF 20.00" },
  ]);
  assert.equal(block.footer, "footerPromotion:7");
});

test("organizerReport : textes de la partie Promotion dans les quatre langues", () => {
  const keys = [
    "promotionTitle",
    "promotionCampaign",
    "promotionClicks",
    "promotionOrders",
    "promotionTickets",
    "promotionRevenue",
    "promotionOther",
    "promotionTotalTickets",
    "promotionTotalRevenue",
    "promotionTotalOther",
    "promotionEmpty",
    "footerPromotion",
  ];
  for (const locale of ["fr", "de", "en", "it"]) {
    const messages = JSON.parse(readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8"));
    const report = messages.organizerReport as Record<string, string>;
    assert.deepEqual(keys.filter((k) => !report[k]?.trim()), [], locale);
    assert.match(report.footerPromotion!, /\{days\}/, locale);
    assert.ok(messages.admin.reports.views.promotion, `${locale} case du rapport`);
    assert.match(messages.admin.orders.fromCampaign, /<campaign>\{name\}<\/campaign>/, locale);
  }
});
