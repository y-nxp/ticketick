import assert from "node:assert/strict";
import { test } from "node:test";
import type { OrderStatus } from "@prisma/client";
import {
  allocateCents,
  campaignDetail,
  campaignFigures,
  campaignState,
  conversionRate,
  isActiveCampaign,
  orderShare,
  type ResultCampaign,
  type ResultOrder,
  type TicketTypeOwner,
} from "./results";

/**
 * Règles de calcul du § 5.2, sur des commandes fabriquées en mémoire : ce
 * sont les mêmes chiffres pour la page de la campagne, la liste et le rapport.
 */

const campaign: ResultCampaign = { id: "cmp-1", organizerId: "org-a", eventId: "ev-promu" };

const owners = new Map<string, TicketTypeOwner>([
  ["tt-promu", { eventId: "ev-promu", organizerId: "org-a" }],
  ["tt-promu-gratuit", { eventId: "ev-promu", organizerId: "org-a" }],
  ["tt-autre", { eventId: "ev-autre", organizerId: "org-a" }],
  ["tt-autre-2", { eventId: "ev-autre-2", organizerId: "org-a" }],
  ["tt-etranger", { eventId: "ev-b", organizerId: "org-b" }],
]);

let n = 0;
function order(
  items: [ticketTypeId: string, quantity: number, unitPriceCents: number][],
  over: Partial<ResultOrder> & { status?: OrderStatus } = {},
): ResultOrder {
  n += 1;
  const lines = items.map(([ticketTypeId, quantity, unitPriceCents]) => ({ ticketTypeId, quantity, unitPriceCents }));
  const options = over.options ?? [];
  return {
    id: `o-${n}`,
    campaignId: campaign.id,
    status: "PAID",
    source: "facebook",
    createdAt: new Date("2026-10-20T10:00:00Z"),
    subtotalCents:
      lines.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0) + options.reduce((s, o) => s + o.amountCents, 0),
    discountCents: 0,
    items: lines,
    tickets: lines.flatMap((l) => Array.from({ length: l.quantity }, () => ({ ticketTypeId: l.ticketTypeId }))),
    options,
    ...over,
  };
}

const totals = (orders: ResultOrder[], clicks = 0) =>
  campaignFigures([campaign], orders, owners, new Map([[campaign.id, clicks]])).get(campaign.id)!;

test("rabais réparti au prorata : la somme des lignes vaut le net de la commande", () => {
  const share = orderShare(
    order([["tt-promu", 2, 3000], ["tt-autre", 1, 4000]], { discountCents: 1000 }),
    campaign,
    owners,
  );
  assert.deepEqual(share.event, { tickets: 2, cents: 5400 });
  assert.deepEqual(share.other, { tickets: 1, cents: 3600 });

  // Arrondi : 2000 centimes sur trois lignes égales, rien ne se perd.
  const uneven = orderShare(
    order([["tt-promu", 1, 1000], ["tt-autre", 1, 1000], ["tt-autre-2", 1, 1000]], { discountCents: 1000 }),
    campaign,
    owners,
  );
  assert.equal(uneven.event.cents + uneven.other.cents, 2000);
  assert.equal(uneven.event.cents, 667);
  assert.equal(uneven.other.cents, 1333);
});

test("allocateCents : somme exacte, jamais négatif, rien sur une ligne à zéro", () => {
  assert.deepEqual(allocateCents([1000, 1000, 1000], 2000), [667, 667, 666]);
  assert.deepEqual(allocateCents([0, 2500, 0], 2000), [0, 2000, 0]);
  assert.deepEqual(allocateCents([1, 1, 1], 2), [1, 1, 0]);
  assert.deepEqual(allocateCents([0, 0], 0), [0, 0]);
  for (const target of [0, 1, 999, 4321]) {
    const out = allocateCents([333, 1, 2500, 7], target);
    assert.equal(out.reduce((s, c) => s + c, 0), target);
    assert.ok(out.every((c) => c >= 0));
  }
});

test("frais de service exclus : seul le prix des billets, rabais déduit, compte", () => {
  // Commande de 90 CHF après rabais, frais de 3 CHF : le total payé (93 CHF)
  // n'entre pas, l'organisateur voit 90 CHF.
  const figures = totals([order([["tt-promu", 3, 3000]], { discountCents: 0 })]);
  assert.equal(figures.event.cents, 9000);
  const discounted = totals([order([["tt-promu", 2, 5000]], { discountCents: 1000 })]);
  assert.equal(discounted.event.cents, 9000);
});

test("remboursée ou annulée : hors des totaux ; billet annulé : hors des totaux", () => {
  const figures = totals([
    order([["tt-promu", 2, 2000]]),
    order([["tt-promu", 5, 2000]], { status: "REFUNDED" }),
    order([["tt-promu", 5, 2000]], { status: "CANCELLED" }),
    order([["tt-promu", 5, 2000]], { status: "AWAITING_PAYMENT" }),
  ]);
  assert.equal(figures.orders, 1);
  assert.deepEqual(figures.event, { tickets: 2, cents: 4000 });

  // Remboursement partiel : trois billets payés, un annulé depuis l'admin.
  const partial = order([["tt-promu", 3, 2000]], { discountCents: 600 });
  partial.tickets = partial.tickets.slice(0, 2);
  assert.deepEqual(totals([partial]).event, { tickets: 2, cents: 3600 });

  // Tous les billets annulés : la commande ne compte plus.
  const emptied = order([["tt-promu", 2, 2000]]);
  emptied.tickets = [];
  assert.equal(totals([emptied]).orders, 0);
});

test("panier multi-organisateurs : deux lignes, l'autre organisateur ignoré", () => {
  const mixed = order([["tt-promu", 1, 5000], ["tt-autre", 2, 1500], ["tt-etranger", 1, 5000]], {
    discountCents: 1300,
  });
  const share = orderShare(mixed, campaign, owners);
  // Rabais de 10 % sur toute la commande, billets de org-b compris.
  assert.deepEqual(share.event, { tickets: 1, cents: 4500 });
  assert.deepEqual(share.other, { tickets: 2, cents: 2700 });

  const figures = totals([mixed]);
  assert.equal(figures.event.tickets + figures.other.tickets, 3);
  assert.equal(figures.event.cents + figures.other.cents, 7200);
});

test("billets gratuits : comptés en billets, jamais en CHF", () => {
  const share = orderShare(
    order([["tt-promu-gratuit", 2, 0], ["tt-promu", 1, 2500]], { discountCents: 500 }),
    campaign,
    owners,
  );
  assert.deepEqual(share.event, { tickets: 3, cents: 2000 });

  const free = totals([order([["tt-promu-gratuit", 4, 0]])]);
  assert.equal(free.orders, 1);
  assert.deepEqual(free.event, { tickets: 4, cents: 0 });
});

test("options à part, avec leur part de rabais ; celles d'un autre organisateur ignorées", () => {
  const share = orderShare(
    order([["tt-promu", 1, 4000]], {
      options: [
        { amountCents: 1000, organizerId: "org-a" },
        { amountCents: 500, organizerId: "org-b" },
      ],
    }),
    campaign,
    owners,
  );
  assert.equal(share.event.cents, 4000);
  assert.equal(share.optionsCents, 1000);

  const discounted = orderShare(
    order([["tt-promu", 1, 4000]], { options: [{ amountCents: 1000, organizerId: "org-a" }], discountCents: 500 }),
    campaign,
    owners,
  );
  assert.equal(discounted.event.cents, 3600);
  assert.equal(discounted.optionsCents, 900);
});

test("taux clics → commandes : aucun taux sans clic", () => {
  assert.equal(conversionRate(totals([order([["tt-promu", 1, 1000]])], 0)), null);
  assert.equal(conversionRate(totals([order([["tt-promu", 1, 1000]])], 40)), 1 / 40);
});

test("détail : clics par jour et par source, ventes au jour de Zurich", () => {
  const detail = campaignDetail(
    campaign,
    [
      // 22 h 30 UTC le 20 octobre : déjà le 21 à Zurich.
      order([["tt-promu", 2, 2000]], { source: "instagram", createdAt: new Date("2026-10-20T22:30:00Z") }),
      order([["tt-autre", 1, 1000]], { source: null, createdAt: new Date("2026-10-20T08:00:00Z") }),
      order([["tt-promu", 9, 2000]], { status: "REFUNDED" }),
    ],
    owners,
    [
      { day: new Date("2026-10-21T00:00:00Z"), source: "code", clicks: 3 },
      { day: new Date("2026-10-20T00:00:00Z"), source: "instagram", clicks: 2 },
      { day: new Date("2026-10-20T00:00:00Z"), source: "facebook", clicks: 5 },
      { day: new Date("2026-10-21T00:00:00Z"), source: "facebook", clicks: 1 },
    ],
  );
  assert.equal(detail.clicks, 11);
  assert.equal(detail.orders, 2);
  assert.deepEqual(detail.sources, ["facebook", "instagram", "code", "link"]);
  assert.deepEqual(
    detail.days.map((d) => [d.day, d.clicks, d.clicksBySource, d.orders, d.tickets, d.cents]),
    [
      ["2026-10-20", 7, { facebook: 5, instagram: 2 }, 1, 1, 1000],
      ["2026-10-21", 4, { code: 3, facebook: 1 }, 1, 2, 4000],
    ],
  );
  assert.deepEqual(
    detail.bySource.map((s) => [s.source, s.clicks, s.orders, s.tickets, s.cents]),
    [
      ["facebook", 6, 0, 0, 0],
      ["instagram", 2, 1, 2, 4000],
      ["code", 3, 0, 0, 0],
      // Vente sans source connue : rangée sous le lien direct.
      ["link", 0, 1, 1, 1000],
    ],
  );
  // Les deux lignes restent séparées dans les totaux.
  assert.deepEqual(detail.event, { tickets: 2, cents: 4000 });
  assert.deepEqual(detail.other, { tickets: 1, cents: 1000 });
});

test("campagnes de la liste : une passe, chacune ses chiffres", () => {
  const other: ResultCampaign = { id: "cmp-2", organizerId: "org-a", eventId: "ev-autre" };
  const figures = campaignFigures(
    [campaign, other],
    [order([["tt-promu", 1, 1000]]), order([["tt-promu", 1, 1000]], { campaignId: "cmp-2" })],
    owners,
    new Map([["cmp-2", 12]]),
  );
  assert.deepEqual(figures.get("cmp-1")!.event, { tickets: 1, cents: 1000 });
  assert.equal(figures.get("cmp-1")!.clicks, 0);
  // Pour la campagne 2, le même billet est un « autre spectacle ».
  assert.deepEqual(figures.get("cmp-2")!.other, { tickets: 1, cents: 1000 });
  assert.equal(figures.get("cmp-2")!.clicks, 12);
});

test("état d'une campagne et campagne active", () => {
  assert.equal(campaignState([]), null);
  assert.equal(campaignState(["DRAFT", "PUBLISHED", "FAILED"]), "PUBLISHED");
  assert.equal(campaignState(["DRAFT", "FAILED"]), "FAILED");
  assert.equal(campaignState(["CANCELLED", "SCHEDULED"]), "SCHEDULED");
  assert.equal(isActiveCampaign(["PUBLISHED"]), true);
  assert.equal(isActiveCampaign(["SCHEDULED", "DRAFT"]), true);
  assert.equal(isActiveCampaign(["DRAFT", "FAILED", "CANCELLED"]), false);
  assert.equal(isActiveCampaign([]), false);
});
