import assert from "node:assert/strict";
import { test } from "node:test";
import { cancellationOutcome } from "./cancellation";

const paidOrder = { status: "COMPLETED", amountCents: 9000 };

test("un remboursement partiel est annoncé avec son montant", () => {
  assert.deepEqual(
    cancellationOutcome({
      tickets: [{ id: "a", priceCents: 4500 }],
      payment: paidOrder,
      charges: [{ kind: "REFUND", status: "OPEN", amountCents: 3000, ticketIds: ["a"] }],
    }),
    { case: "refund", refundCents: 3000 },
  );
});

test("le remboursement intégral chez le prestataire couvre les billets d'origine", () => {
  assert.deepEqual(
    cancellationOutcome({
      tickets: [
        { id: "a", priceCents: 4500 },
        { id: "b", priceCents: 4500 },
      ],
      payment: { status: "REFUNDED", amountCents: 9000 },
      charges: [],
    }),
    { case: "refund", refundCents: 9000 },
  );
});

test("un remboursement annulé ou lié à d'autres billets ne compte pas", () => {
  assert.equal(
    cancellationOutcome({
      tickets: [{ id: "a", priceCents: 4500 }],
      payment: paidOrder,
      charges: [
        { kind: "REFUND", status: "CANCELLED", amountCents: 4500, ticketIds: ["a"] },
        { kind: "REFUND", status: "DONE", amountCents: 4500, ticketIds: ["z"] },
      ],
    }).case,
    "noRefund",
  );
});

test("des billets payés sans remboursement", () => {
  assert.deepEqual(
    cancellationOutcome({
      tickets: [{ id: "a", priceCents: 4500 }],
      payment: paidOrder,
      charges: [],
    }),
    { case: "noRefund", refundCents: 0 },
  );
});

test("des billets gratuits", () => {
  assert.equal(
    cancellationOutcome({
      tickets: [{ id: "a", priceCents: 0 }],
      payment: { status: "COMPLETED", amountCents: 0 },
      charges: [],
    }).case,
    "free",
  );
});

test("une réservation ou un lien jamais payé", () => {
  assert.equal(
    cancellationOutcome({
      tickets: [{ id: "a", priceCents: 4500 }],
      payment: null,
      charges: [],
    }).case,
    "unpaid",
  );
  assert.equal(
    cancellationOutcome({
      tickets: [{ id: "b", priceCents: 4500 }],
      payment: paidOrder,
      charges: [{ kind: "PAYMENT", status: "EXPIRED", amountCents: 4500, ticketIds: ["b"] }],
    }).case,
    "unpaid",
  );
});

test("des places ajoutées et encaissées comptent comme payées", () => {
  assert.equal(
    cancellationOutcome({
      tickets: [{ id: "b", priceCents: 4500 }],
      payment: null,
      charges: [{ kind: "PAYMENT", status: "DONE", amountCents: 4500, ticketIds: ["b"] }],
    }).case,
    "noRefund",
  );
});
