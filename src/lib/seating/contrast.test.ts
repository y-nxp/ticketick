import assert from "node:assert/strict";
import { test } from "node:test";
import { contrastRatio, TAKEN_GREY } from "./contrast";

test("contraste : noir/blanc à 21, couleur illisible à 1", () => {
  assert.equal(Math.round(contrastRatio("#000", "#ffffff")), 21);
  assert.equal(contrastRatio("nope", "#fff"), 1);
});

test("le gris des places occupées s'écarte de la lavande et des pastels des catégories (Rougemont Cat. 2)", () => {
  const pastels = ["#CFC9F8", "#F7B7B7", "#FFF59D", "#9FD4F5"];
  for (const color of pastels) {
    assert.ok(contrastRatio(TAKEN_GREY, color) >= 1.5, `${TAKEN_GREY} trop proche de ${color}`);
  }
  // L'ancien gris clair se confondait avec la Cat. 2 de Rougemont.
  assert.ok(contrastRatio("#d4d4d8", "#F7B7B7") < 1.5);
});

test("la croix d'encre reste nette sur le gris des places occupées", () => {
  assert.ok(contrastRatio(TAKEN_GREY, "#2a2c30") >= 4.5);
});
