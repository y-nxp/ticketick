import assert from "node:assert/strict";
import { test } from "node:test";
import { demoProvider, demoPublisherAllowed } from "./demo-provider";
import { PromotionProviderError, resolveProvider, type PublishAccount } from "./provider";

const account: PublishAccount = {
  id: "acc-1",
  provider: "FACEBOOK_PAGE",
  externalId: "1234567890",
  status: "ACTIVE",
  tokenEnc: null,
  viaAccountId: null,
};
const demoAccount = { ...account, externalId: "demo-page" };

test("verrou : sans PROMOTION_DEMO_PUBLISHER=1, aucun éditeur, quel que soit l'environnement", () => {
  for (const env of [{}, { NODE_ENV: "development" }, { NODE_ENV: "production" }, { PROMOTION_DEMO_PUBLISHER: "true" }]) {
    assert.equal(resolveProvider(account, env), null, JSON.stringify(env));
    assert.equal(resolveProvider(demoAccount, env), null, JSON.stringify(env));
  }
});

test("verrou : en production, la démonstration ne vaut que pour un compte demo-", () => {
  const env = { NODE_ENV: "production", PROMOTION_DEMO_PUBLISHER: "1" };
  assert.equal(resolveProvider(account, env), null);
  assert.equal(demoPublisherAllowed(account, env), false);
  assert.equal(resolveProvider(demoAccount, env), demoProvider);
});

test("verrou : hors production, la démonstration est permise avec le drapeau", () => {
  const env = { NODE_ENV: "development", PROMOTION_DEMO_PUBLISHER: "1" };
  assert.equal(resolveProvider(account, env), demoProvider);
  assert.equal(resolveProvider({ ...account, provider: "INSTAGRAM_BUSINESS" }, { PROMOTION_DEMO_PUBLISHER: "1" }), demoProvider);
});

test("erreur typée : un code mal formé (jeton, URL) est écarté", () => {
  assert.equal(new PromotionProviderError("TOKEN", { code: "190" }).code, "190");
  assert.equal(new PromotionProviderError("PERMANENT", { code: "4/2207051" }).code, "4/2207051");
  assert.equal(new PromotionProviderError("TRANSIENT", { code: "1&access_token=EAAG123" }).code, null);
  assert.equal(new PromotionProviderError("TRANSIENT", { code: "x".repeat(60) }).code, null);
});
