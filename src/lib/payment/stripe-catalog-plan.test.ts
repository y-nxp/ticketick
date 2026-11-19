import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countSteps,
  planCatalog,
  productIdOf,
  productName,
  type CatalogProduct,
  type CatalogTariff,
} from "./stripe-catalog-plan";

const tariff = (id: string, priceCents: number, eventId = "ev1"): CatalogTariff => ({
  ticketTypeId: id,
  sessionId: "s1",
  eventId,
  eventTitle: "Vittorio Grigolo",
  startsAt: new Date("2026-12-29T18:00:00Z"),
  tariff: "Premium",
  name: `29.12.2026 19:00 · Premium · ${id}`,
  description: "Gstaad New Year Music Festival",
  priceCents,
  currency: "chf",
  url: null,
  image: null,
});

const product = (t: CatalogTariff, over: Partial<CatalogProduct> = {}): CatalogProduct => ({
  id: productIdOf(t.ticketTypeId),
  name: t.name,
  description: t.description,
  active: true,
  url: null,
  images: [],
  eventId: t.eventId,
  organizerId: "org1",
  price: { id: `price_${t.ticketTypeId}`, cents: t.priceCents, currency: "chf", active: true },
  ...over,
});

test("product name starts with the Zurich date so staff can search by day", () => {
  assert.equal(
    productName({
      startsAt: new Date("2026-12-26T18:00:00Z"),
      timeZone: "Europe/Zurich",
      tariff: "Catégorie 1",
      eventTitle: "Juliana Grigoryan & Hasmik Antonyan",
    }),
    "26.12.2026 19:00 · Catégorie 1 · Juliana Grigoryan & Hasmik Antonyan",
  );
  assert.equal(
    productName({
      startsAt: new Date("2027-07-01T08:00:00Z"),
      timeZone: "Europe/Zurich",
      tariff: "Adulte",
      eventTitle: "Récital",
      sessionLabel: "Matinée",
    }),
    "01.07.2027 10:00 · Adulte · Récital (Matinée)",
  );
});

test("plan creates, keeps, reprices and archives", () => {
  const premium = tariff("a", 25000);
  const cat1 = tariff("b", 20000);
  const cat2 = tariff("c", 9000);
  const products = [
    product(premium),
    product(cat1, { price: { id: "p_old", cents: 18000, currency: "chf", active: true } }),
    product(tariff("gone", 5000)),
    product(tariff("other-org", 5000), { organizerId: "org2" }),
    product(tariff("already-archived", 5000), { active: false }),
  ];
  const steps = planCatalog([premium, cat1, cat2], products, { organizerId: "org1" });
  assert.deepEqual(
    steps.map((s) => [s.kind, s.kind === "archive" ? s.product.id : s.tariff.ticketTypeId]),
    [
      ["keep", "a"],
      ["update", "b"],
      ["create", "c"],
      ["archive", "ticketick_gone"],
    ],
  );
  const update = steps[1];
  assert.ok(update.kind === "update" && update.changes.includes("price"));
  assert.deepEqual(countSteps(steps), { create: 1, update: 1, keep: 1, archive: 1 });
});

test("an archived product comes back on sale; event scope limits archiving", () => {
  const t = tariff("a", 5000);
  const back = planCatalog([t], [product(t, { active: false })], { organizerId: "org1" });
  assert.ok(back[0].kind === "update" && back[0].changes.includes("reactivate"));
  assert.ok(back[0].kind === "update" && !back[0].changes.includes("price"));

  const elsewhere = product(tariff("x", 5000, "ev2"));
  const scoped = planCatalog([t], [product(t), elsewhere], { organizerId: "org1", eventId: "ev1" });
  assert.deepEqual(scoped.map((s) => s.kind), ["keep"]);
});
