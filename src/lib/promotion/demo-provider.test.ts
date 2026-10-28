import assert from "node:assert/strict";
import { test } from "node:test";
import { demoProvider } from "./demo-provider";
import { PromotionProviderError, type PublishAccount, type PublishablePost } from "./provider";

const account: PublishAccount = {
  id: "acc-1",
  provider: "FACEBOOK_PAGE",
  externalId: "1234567890",
  status: "ACTIVE",
  tokenEnc: null,
  viaAccountId: null,
};

function post(message: string, attempts = 0): PublishablePost {
  return { id: "p1", message, imagePath: null, linkUrl: "https://ticketick.ch/p/ABCDEFGH?s=fb", attempts };
}

test("démonstration : réussite factice, sans réseau", async () => {
  const result = await demoProvider.publish(post("Venez !"), account);
  assert.equal(result.externalId, "demo-1234567890-p1");
  assert.match(result.permalink!, /^https:\/\/demo\.invalid\/promotion\//);
});

test("démonstration : chaque marqueur donne son erreur typée", async () => {
  const kindOf = async (message: string, attempts = 0) => {
    try {
      await demoProvider.publish(post(message, attempts), account);
      return "ok";
    } catch (error) {
      assert.ok(error instanceof PromotionProviderError);
      return error.kind;
    }
  };
  assert.equal(await kindOf("x [demo:transient]"), "TRANSIENT");
  assert.equal(await kindOf("x [demo:transient]", 5), "TRANSIENT");
  assert.equal(await kindOf("x [demo:token]"), "TOKEN");
  assert.equal(await kindOf("x [demo:permanent]"), "PERMANENT");
  assert.equal(await kindOf("x [demo:transient:2]", 0), "TRANSIENT");
  assert.equal(await kindOf("x [demo:transient:2]", 1), "TRANSIENT");
  assert.equal(await kindOf("x [demo:transient:2]", 2), "ok");
});
