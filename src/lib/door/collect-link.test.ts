import { test } from "node:test";
import assert from "node:assert/strict";
import { collectLaunchUrl, readCollectReturn, saleDescription } from "./collect-link";

test("Collect launch link carries amount in cents, description and callback", () => {
  const url = new URL(
    collectLaunchUrl({
      amountCents: 25000,
      description: saleDescription({
        organizer: "NYMF",
        when: "29.12.2026 19:00",
        title: "Vittorio Grigolo",
        lines: [{ quantity: 2, tariff: "Premium" }],
      }),
      callback: "https://ticketick.ch/door/sell/done/abc.def.ghi",
    }),
  );
  assert.equal(url.origin + url.pathname, "https://app.collectforstripe.com/launchApp");
  assert.equal(url.searchParams.get("action"), "beginTransaction");
  assert.equal(url.searchParams.get("amount"), "25000");
  assert.equal(url.searchParams.get("description"), "NYMF · 29.12.2026 19:00 · Vittorio Grigolo · 2× Premium");
  assert.equal(url.searchParams.get("callback"), "https://ticketick.ch/door/sell/done/abc.def.ghi");
});

test("Collect return: success needs a Stripe charge id, anything else is a failure", () => {
  assert.deepEqual(readCollectReturn({ result: "success", finalAmount: "250.00", chargeId: "ch_123abc" }), {
    result: "success",
    chargeId: "ch_123abc",
    finalAmount: "250.00",
  });
  assert.deepEqual(readCollectReturn({ result: "fail" }), { result: "fail" });
  assert.deepEqual(readCollectReturn({ result: "success" }), { result: "fail" });
  assert.deepEqual(readCollectReturn({ result: "success", chargeId: "ch_1'; drop" }), { result: "fail" });
});
