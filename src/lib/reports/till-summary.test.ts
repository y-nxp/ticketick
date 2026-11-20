import { test } from "node:test";
import assert from "node:assert/strict";
import { bucketOf, summarizeTill } from "./till-summary";

const line = (name: string, quantity: number, unitPriceCents: number) => ({ name, quantity, unitPriceCents });

test("till sales split by method, online and offline apart", () => {
  const s = summarizeTill([
    { provider: "collect", amountCents: 25000, sellerId: "a", sellerName: "Anne", lines: [line("Premium", 1, 25000)] },
    { provider: "card_offline", amountCents: 10000, sellerId: "b", sellerName: "Bruno", lines: [line("Cat. 1", 1, 10000)] },
    { provider: "twint", amountCents: 20000, sellerId: "a", sellerName: "Anne", lines: [line("Cat. 1", 2, 10000)] },
    { provider: "cash", amountCents: 5000, sellerId: "b", sellerName: "Bruno", lines: [line("Cat. 2", 1, 5000)] },
    { provider: "cash", amountCents: 5000, sellerId: "b", sellerName: "Bruno", lines: [line("Cat. 2", 1, 5000), line("Enfant", 1, 0)] },
    { provider: "free", amountCents: 0, sellerId: "a", sellerName: "Anne", lines: [line("Invitation", 2, 0)] },
  ]);
  assert.equal(s.sales, 6);
  assert.equal(s.tickets, 9);
  assert.equal(s.freeTickets, 3);
  assert.equal(s.cents, 65000);
  assert.deepEqual(s.parts.cardOnline, { sales: 1, cents: 25000 });
  assert.deepEqual(s.parts.cardOffline, { sales: 1, cents: 10000 });
  assert.deepEqual(s.parts.twintOffline, { sales: 1, cents: 20000 });
  assert.deepEqual(s.parts.twintOnline, { sales: 0, cents: 0 });
  assert.deepEqual(s.parts.cash, { sales: 2, cents: 10000 });
  assert.deepEqual(
    s.tariffs.map((t) => [t.name, t.quantity, t.cents]),
    [["Premium", 1, 25000], ["Cat. 1", 3, 30000], ["Cat. 2", 2, 10000], ["Enfant", 1, 0], ["Invitation", 2, 0]],
  );
  const bruno = s.sellers.find((x) => x.name === "Bruno")!;
  assert.equal(bruno.parts.cash.cents, 10000);
  assert.equal(bruno.cents, 20000);
  const anne = s.sellers.find((x) => x.name === "Anne")!;
  assert.equal(anne.tickets, 5);
  assert.equal(anne.cents, 45000);
});

test("unknown provider counts in the total but in no method", () => {
  assert.equal(bucketOf("free"), null);
  assert.equal(bucketOf("collect"), "cardOnline");
  const s = summarizeTill([]);
  assert.equal(s.sales, 0);
  assert.deepEqual(s.sellers, []);
});
