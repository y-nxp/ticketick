import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attributeOrder,
  promotionOrderFields,
  resolveOrderAttribution,
  type AttributionCampaign,
  type AttributionContext,
} from "./attribution";
import { parsePromotionCookie, serializePromotionCookie, type PromotionClick } from "./cookie";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-11-10T18:00:00Z");
const campaign: AttributionCampaign = { id: "cmp_1", organizerId: "org_a" };

function click(ageMs: number, code = "abcdefgh"): PromotionClick {
  return { code, source: "facebook", clickAt: new Date(now.getTime() - ageMs) };
}

function context(overrides: Partial<AttributionContext> = {}): AttributionContext {
  return { click: click(DAY), channel: "ONLINE", organizerIds: ["org_a"], now, ...overrides };
}

/** Recherche simulée : compte les appels, comme le ferait la base. */
function store(found: AttributionCampaign | null = campaign) {
  const calls: string[] = [];
  return {
    calls,
    find: async (code: string) => {
      calls.push(code);
      return found;
    },
  };
}

test("un clic récent sur une campagne de l'organisateur est attribué, champs figés", () => {
  const c = click(DAY);
  assert.deepEqual(attributeOrder(context({ click: c }), campaign), {
    promotionCampaignId: "cmp_1",
    promotionSource: "facebook",
    promotionClickAt: c.clickAt,
  });
});

test("fenêtre de 7 jours : attribué à 7 jours pile, plus au-delà", () => {
  assert.notEqual(attributeOrder(context({ click: click(7 * DAY) }), campaign), null);
  assert.equal(attributeOrder(context({ click: click(7 * DAY + 1) }), campaign), null);
  assert.equal(attributeOrder(context({ click: click(30 * DAY) }), campaign), null);
});

test("un horodatage dans le futur (cookie forgé) n'est pas attribué", () => {
  assert.equal(attributeOrder(context({ click: click(-DAY) }), campaign), null);
  // Petit écart d'horloge entre instances : toléré.
  assert.notEqual(attributeOrder(context({ click: click(-60_000) }), campaign), null);
});

test("panier multi-organisateurs avec un billet de l'organisateur : attribué", () => {
  const result = attributeOrder(context({ organizerIds: ["org_b", "org_a", "org_c"] }), campaign);
  assert.equal(result?.promotionCampaignId, "cmp_1");
});

test("panier sans billet de l'organisateur de la campagne : non attribué", () => {
  assert.equal(attributeOrder(context({ organizerIds: ["org_b", "org_c"] }), campaign), null);
  assert.equal(attributeOrder(context({ organizerIds: [] }), campaign), null);
});

test("guichet et point de vente ne sont jamais attribués", () => {
  assert.equal(attributeOrder(context({ channel: "BOX_OFFICE" }), campaign), null);
  assert.equal(attributeOrder(context({ channel: "RESELLER" }), campaign), null);
});

test("campagne inconnue : ignorée, sans erreur", async () => {
  assert.equal(attributeOrder(context(), null), null);
  const db = store(null);
  assert.equal(await resolveOrderAttribution(context(), db.find), null);
  assert.deepEqual(db.calls, ["abcdefgh"]);
});

test("dernier clic gagne : le nouveau cookie remplace l'ancien", async () => {
  const first = serializePromotionCookie({ code: "aaaaaaaa", source: "facebook", clickAt: new Date(now.getTime() - 3 * DAY) });
  const second = serializePromotionCookie({ code: "bbbbbbbb", source: "instagram", clickAt: new Date(now.getTime() - DAY) });
  assert.notEqual(first, second);
  // Le navigateur ne garde qu'une valeur par nom : la dernière posée.
  const db = store({ id: "cmp_2", organizerId: "org_a" });
  const result = await resolveOrderAttribution(context({ click: parsePromotionCookie(second) }), db.find);
  assert.deepEqual(db.calls, ["bbbbbbbb"]);
  assert.equal(result?.promotionCampaignId, "cmp_2");
  assert.equal(result?.promotionSource, "instagram");
});

test("sans cookie : aucune requête, aucune attribution", async () => {
  const db = store();
  assert.equal(await resolveOrderAttribution(context({ click: undefined }), db.find), null);
  assert.equal(await resolveOrderAttribution(context({ click: null }), db.find), null);
  assert.deepEqual(db.calls, []);
});

test("hors canal en ligne ou hors fenêtre : la campagne n'est même pas cherchée", async () => {
  const db = store();
  await resolveOrderAttribution(context({ channel: "RESELLER" }), db.find);
  await resolveOrderAttribution(context({ channel: "BOX_OFFICE" }), db.find);
  await resolveOrderAttribution(context({ click: click(8 * DAY) }), db.find);
  assert.deepEqual(db.calls, []);
});

test("une panne de lecture n'empêche pas la commande", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const result = await resolveOrderAttribution(context(), async () => {
      throw new Error("base indisponible");
    });
    assert.equal(result, null);
  } finally {
    console.error = original;
  }
});

test("non-régression : sans attribution, les données de la commande sont inchangées", () => {
  const data = {
    reference: "TT-ABCD-EFGH",
    status: "AWAITING_PAYMENT",
    channel: "ONLINE",
    subtotalCents: 4500,
    totalCents: 4500,
    currency: "CHF",
  };
  const written = { ...data, ...promotionOrderFields(null) };
  assert.deepEqual(written, data);
  assert.deepEqual(Object.keys(written), Object.keys(data));
});

test("avec attribution : exactement les trois champs d'Order en plus", () => {
  const fields = promotionOrderFields(attributeOrder(context(), campaign));
  assert.deepEqual(Object.keys(fields).sort(), [
    "promotionCampaignId",
    "promotionClickAt",
    "promotionSource",
  ]);
});
