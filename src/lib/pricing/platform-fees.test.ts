import assert from "node:assert/strict";
import { test } from "node:test";
import { chf, percentLabel, platformFeeCents, PLATFORM_FEES } from "./platform-fees";

test("commission : billet à CHF 35 en libre-service et en premium", () => {
  assert.equal(platformFeeCents("selfService", 3_500), 113);
  assert.equal(platformFeeCents("premium", 3_500), 213);
});

test("commission : un billet gratuit ne coûte rien", () => {
  assert.equal(platformFeeCents("selfService", 0), 0);
  assert.equal(platformFeeCents("premium", 0), 0);
});

test("libellés : francs à deux décimales, pourcentage selon la langue", () => {
  assert.equal(chf(PLATFORM_FEES.selfService.fixedCents), "0.50");
  assert.equal(percentLabel(180, "fr"), "1,8 %");
  assert.equal(percentLabel(180, "de"), "1.8%");
  assert.equal(percentLabel(350, "en"), "3.5%");
  assert.equal(percentLabel(350, "it"), "3,5%");
});

// Les textes du site répètent les deux taux (FAQ, bandeau d'accueil) : un
// changement de grille doit les faire échouer ici plutôt qu'en ligne.
test("les textes du site citent les taux de la grille", async () => {
  for (const locale of ["fr", "en", "de", "it"]) {
    const messages = (await import(`../../../messages/${locale}.json`)).default;
    const faq: string = messages.about.faqFeesA;
    const band: string = messages.home.organizerBandText;
    for (const plan of ["selfService", "premium"] as const) {
      const { fixedCents, bps } = PLATFORM_FEES[plan];
      const price = `CHF ${chf(fixedCents)} + ${percentLabel(bps, locale)}`;
      assert.ok(faq.includes(price), `${locale} : la FAQ ne cite pas « ${price} »`);
      if (plan === "selfService") assert.ok(band.includes(price), `${locale} : l'accueil ne cite pas « ${price} »`);
    }
  }
});
