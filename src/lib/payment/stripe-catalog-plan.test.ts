import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countSteps,
  planCatalog,
  productIdOf,
  productName,
  type CatalogPrice,
  type CatalogProduct,
  type CatalogSession,
  type CatalogTariff,
} from "./stripe-catalog-plan";

const tariff = (id: string, name: string, priceCents: number): CatalogTariff => ({
  ticketTypeId: id,
  tariff: name,
  priceCents,
  currency: "chf",
});

const session = (id: string, tariffs: CatalogTariff[], eventId = "ev1"): CatalogSession => ({
  sessionId: id,
  eventId,
  eventTitle: "Vittorio Grigolo",
  startsAt: new Date("2026-12-29T18:00:00Z"),
  name: `29.12.2026 19:00 · Vittorio Grigolo ${id}`,
  description: "Gstaad New Year Music Festival",
  url: null,
  image: null,
  tariffs,
});

const priceOf = (t: CatalogTariff, over: Partial<CatalogPrice> = {}): CatalogPrice => ({
  id: `price_${t.ticketTypeId}`,
  ticketTypeId: t.ticketTypeId,
  nickname: t.tariff,
  cents: t.priceCents,
  currency: t.currency,
  ...over,
});

const product = (s: CatalogSession, over: Partial<CatalogProduct> = {}): CatalogProduct => ({
  id: productIdOf(s.sessionId),
  name: s.name,
  description: s.description,
  active: true,
  url: null,
  images: [],
  eventId: s.eventId,
  organizerId: "org1",
  defaultPriceId: s.tariffs[0] ? `price_${s.tariffs[0].ticketTypeId}` : null,
  prices: s.tariffs.map((t) => priceOf(t)),
  ...over,
});

test("product name starts with the Zurich date, then the show", () => {
  assert.equal(
    productName({
      startsAt: new Date("2026-12-26T18:00:00Z"),
      timeZone: "Europe/Zurich",
      eventTitle: "Juliana Grigoryan & Hasmik Antonyan",
    }),
    "26.12.2026 19:00 · Juliana Grigoryan & Hasmik Antonyan",
  );
  assert.equal(
    productName({
      startsAt: new Date("2027-07-01T08:00:00Z"),
      timeZone: "Europe/Zurich",
      eventTitle: "Récital",
      sessionLabel: "Matinée",
    }),
    "01.07.2027 10:00 · Récital (Matinée)",
  );
});

test("one product per date: create, keep, and archive old per-tariff products", () => {
  const premium = tariff("a", "Premium", 25000);
  const cat1 = tariff("b", "Catégorie 1", 20000);
  const s1 = session("s1", [premium, cat1]);
  const s2 = session("s2", [tariff("c", "Placement libre", 5000)]);
  const products = [
    product(s1),
    // Ancien produit « un par tarif » : retiré.
    { ...product(s1), id: "ticketick_a", defaultPriceId: null, prices: [] },
    { ...product(s1), id: "ticketick_other", organizerId: "org2" },
    { ...product(s1), id: "ticketick_archived", active: false, prices: [], defaultPriceId: null },
  ];
  const steps = planCatalog([s1, s2], products, { organizerId: "org1" });
  assert.deepEqual(
    steps.map((s) => [s.kind, s.kind === "archive" ? s.product.id : s.session.sessionId]),
    [
      ["keep", "s1"],
      ["create", "s2"],
      ["archive", "ticketick_a"],
    ],
  );
  assert.deepEqual(countSteps(steps), { create: 1, update: 0, keep: 1, archive: 1 });
});

test("price changes: new amount, renamed tariff, deleted tariff, new default", () => {
  const premium = tariff("a", "Premium", 26000);
  const cat1 = tariff("b", "Cat. 1", 20000);
  const s1 = session("s1", [premium, cat1]);
  const existing = product(s1, {
    prices: [
      priceOf(premium, { cents: 25000 }),
      priceOf(cat1, { nickname: "Catégorie 1" }),
      priceOf(tariff("gone", "Catégorie 3", 5000)),
    ],
  });
  const [step] = planCatalog([s1], [existing], { organizerId: "org1" });
  assert.equal(step.kind, "update");
  if (step.kind !== "update") return;
  assert.deepEqual(
    step.tariffs.map((t) => t.state.kind),
    ["reprice", "rename"],
  );
  assert.deepEqual(
    step.archivePrices.map((p) => p.id).sort(),
    ["price_a", "price_gone"],
  );
  assert.ok(step.changes.includes("prices"));
});

test("an archived date comes back on sale; event scope limits archiving", () => {
  const s1 = session("s1", [tariff("a", "Premium", 5000)]);
  const [back] = planCatalog([s1], [product(s1, { active: false })], { organizerId: "org1" });
  assert.ok(back.kind === "update" && back.changes.includes("reactivate"));
  assert.ok(back.kind === "update" && !back.changes.includes("prices"));

  const elsewhere = product(session("s9", [tariff("x", "Premium", 5000)], "ev2"));
  const scoped = planCatalog([s1], [product(s1), elsewhere], { organizerId: "org1", eventId: "ev1" });
  assert.deepEqual(scoped.map((s) => s.kind), ["keep"]);
});

test("an archived product whose prices stayed active is cleaned up, then left alone", () => {
  const old = product(session("s1", [tariff("a", "Premium", 5000)]), { id: "ticketick_a", active: false });
  assert.deepEqual(planCatalog([], [old], { organizerId: "org1" }).map((s) => s.kind), ["archive"]);
  const done = { ...old, prices: [], defaultPriceId: null };
  assert.deepEqual(planCatalog([], [done], { organizerId: "org1" }), []);
});
