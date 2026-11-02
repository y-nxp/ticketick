import assert from "node:assert/strict";
import { test } from "node:test";
import { shareOut } from "./split";

test("un seul concert : tout lui revient", () => {
  assert.deepEqual(shareOut(12345, [9000]), [12345]);
});

test("deux concerts : au prorata, la somme est exacte", () => {
  const parts = shareOut(1000, [1, 2]);
  assert.deepEqual(parts, [333, 667]);
  assert.equal(parts.reduce((s, p) => s + p, 0), 1000);
});

test("montant négatif (remboursement) : réparti de même", () => {
  const parts = shareOut(-1001, [1, 1]);
  assert.equal(parts.reduce((s, p) => s + p, 0), -1001);
});

test("poids nuls : tout au premier", () => {
  assert.deepEqual(shareOut(500, [0, 0]), [500, 0]);
});
