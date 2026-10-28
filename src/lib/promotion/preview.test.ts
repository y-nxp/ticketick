import assert from "node:assert/strict";
import { test } from "node:test";
import { countHashtags, foldAt, previewWarnings } from "./preview";

test("Instagram : lien non cliquable toujours signalé, repli après 125 caractères", () => {
  assert.deepEqual(previewWarnings({ channel: "instagram", message: "Court", hasImage: true }), ["linkNotClickable"]);
  assert.deepEqual(previewWarnings({ channel: "instagram", message: "x".repeat(126), hasImage: true }), [
    "linkNotClickable",
    "truncated",
  ]);
  assert.deepEqual(previewWarnings({ channel: "instagram", message: "x".repeat(2201), hasImage: true }), [
    "linkNotClickable",
    "tooLong",
  ]);
});

test("Instagram : visuel exigé, recadrage hors de 4:5 à 1,91:1", () => {
  assert.ok(previewWarnings({ channel: "instagram", message: "a", hasImage: false }).includes("imageRequired"));
  const ratio = (imageRatio: number) =>
    previewWarnings({ channel: "instagram", message: "a", hasImage: true, imageRatio }).includes("imageCropped");
  assert.equal(ratio(1), false);
  assert.equal(ratio(0.8), false);
  assert.equal(ratio(1.91), false);
  assert.equal(ratio(9 / 16), true);
  assert.equal(ratio(3), true);
});

test("Facebook : pas de visuel exigé, repli sur la longueur ou le nombre de lignes", () => {
  assert.deepEqual(previewWarnings({ channel: "facebook", message: "Court", hasImage: false }), []);
  assert.equal(foldAt("facebook", "x".repeat(480)), null);
  assert.equal(foldAt("facebook", "x".repeat(481)), 480);
  assert.equal(foldAt("facebook", "a\nb\nc\nd\ne\nf\ng\nh"), "a\nb\nc\nd\ne\nf\ng".length);
});

test("mots-clics : plus de 30 signalés pour Instagram", () => {
  const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
  assert.equal(countHashtags(tags), 31);
  assert.equal(countHashtags("prix#1 et #Été"), 1);
  assert.ok(previewWarnings({ channel: "instagram", message: tags, hasImage: true }).includes("tooManyHashtags"));
});
