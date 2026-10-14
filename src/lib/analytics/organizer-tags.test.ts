import assert from "node:assert/strict";
import { test } from "node:test";
import { organizerTagsFromRow, organizerTagsInput } from "./organizer-tags";

test("une saisie vide efface les deux identifiants", () => {
  const parsed = organizerTagsInput.parse({ metaPixelId: "  ", ga4MeasurementId: "" });
  assert.deepEqual(parsed, { metaPixelId: null, ga4MeasurementId: null });
});

test("l'ID Google Analytics est accepté en minuscules et rangé en majuscules", () => {
  const parsed = organizerTagsInput.parse({ metaPixelId: "1063460356690903", ga4MeasurementId: " g-abc123xyz9 " });
  assert.deepEqual(parsed, { metaPixelId: "1063460356690903", ga4MeasurementId: "G-ABC123XYZ9" });
});

test("un identifiant mal formé est refusé avec sa clé d'erreur", () => {
  const pixel = organizerTagsInput.safeParse({ metaPixelId: "fbq('init')", ga4MeasurementId: "" });
  assert.equal(pixel.success, false);
  assert.equal(pixel.error?.issues[0]?.message, "metaPixelInvalid");

  const ga = organizerTagsInput.safeParse({ metaPixelId: "", ga4MeasurementId: "UA-12345-1" });
  assert.equal(ga.success, false);
  assert.equal(ga.error?.issues[0]?.message, "ga4IdInvalid");
});

test("une valeur invalide en base n'atteint jamais la page", () => {
  assert.deepEqual(organizerTagsFromRow({ metaPixelId: "123'</script>", ga4MeasurementId: "G-OK1234" }), {
    ga4Id: "G-OK1234",
  });
  assert.deepEqual(organizerTagsFromRow({ metaPixelId: null, ga4MeasurementId: null }), {});
});
