import assert from "node:assert/strict";
import { test } from "node:test";
import { contrastRatio, takenFill } from "./contrast";

test("contraste : noir/blanc à 21, couleur illisible à 1", () => {
  assert.equal(Math.round(contrastRatio("#000", "#ffffff")), 21);
  assert.equal(contrastRatio("nope", "#fff"), 1);
});

test("le gris des places occupées s'écarte des catégories claires (Rougemont Cat. 2)", () => {
  const colors = ["#F7B7B7", "#CFC9F8", "#E13FE3"];
  const grey = takenFill(colors);
  assert.ok(Math.min(...colors.map((c) => contrastRatio(grey, c))) >= 1.5);
  assert.ok(contrastRatio("#d4d4d8", "#F7B7B7") < 1.5);
});

test("sans catégorie, gris moyen", () => {
  assert.equal(takenFill([]), "#9a9aa3");
});
