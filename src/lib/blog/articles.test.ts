import { test } from "node:test";
import assert from "node:assert/strict";
import {
  articleLocale,
  articlePath,
  blogIndexPath,
  listingLocale,
  localesWithArticles,
  parseFaq,
  prepareArticles,
} from "./articles";

const base = {
  title: "Titre",
  seoTitle: "Titre SEO",
  description: "Résumé",
  geoTarget: "Suisse romande",
  publishedAt: "2026-11-19T10:00:00Z",
  updatedAt: "2026-11-19T03:00:00Z",
  html: "<p>Corps</p>",
  image: "https://manager.nextalp.com/api/public/articles/ticketick/x/image?v=1",
  imageAlt: "Salle",
  faq: [{ q: "Question ?", a: "Réponse." }],
  keyword: "billetterie",
  cluster: "Associations",
};

test("FAQ : liste d'objets, chaîne JSON, autres noms de champ, texte libre", () => {
  const expected = [{ q: "Question ?", a: "Réponse." }];
  assert.deepEqual(parseFaq([{ q: " Question ? ", a: "Réponse." }]), expected);
  assert.deepEqual(parseFaq('[{"q":"Question ?","a":"Réponse."}]'), expected);
  assert.deepEqual(parseFaq([{ question: "Question ?", answer: "Réponse." }]), expected);
  assert.deepEqual(parseFaq({ items: [{ q: "Question ?", a: "Réponse." }] }), expected);
  assert.deepEqual(parseFaq("Q : Question ?\nR : Réponse."), expected);
  assert.deepEqual(parseFaq("F: Frage?\nA: Antwort,\nauf zwei Zeilen."), [{ q: "Frage?", a: "Antwort, auf zwei Zeilen." }]);
  // Entrées incomplètes écartées, valeurs vides tolérées.
  assert.deepEqual(parseFaq([{ q: "Sans réponse" }, null, "x", { q: "Question ?", a: "Réponse." }]), expected);
  assert.deepEqual(parseFaq(null), []);
  assert.deepEqual(parseFaq(""), []);
  assert.deepEqual(parseFaq("[pas du json"), []);
});

test("langue de l'API → langue du site et adresse", () => {
  assert.equal(articleLocale("fr"), "fr");
  assert.equal(articleLocale("DE"), "de");
  assert.equal(articleLocale("de-CH"), "de");
  assert.equal(articleLocale("it_CH"), "it");
  assert.equal(articleLocale("es"), null); // l'espagnol ne couvre que la boutique
  assert.equal(articleLocale(undefined), null);
  assert.equal(articlePath({ slug: "twint-billetterie", locale: "fr" }), "/blog/twint-billetterie");
  assert.equal(articlePath({ slug: "online-ticketing-verein", locale: "de" }), "/de/blog/online-ticketing-verein");
  assert.equal(blogIndexPath("fr"), "/blog");
  assert.equal(blogIndexPath("de"), "/de/blog");
});

test("réponse de l'API → articles triés, assainis, liens réécrits", () => {
  const articles = prepareArticles({
    site: "ticketick",
    count: 5,
    articles: [
      { ...base, slug: "ancien", language: "fr", publishedAt: "2026-11-01T08:00:00Z" },
      {
        ...base,
        slug: "recent",
        language: "fr",
        faq: JSON.stringify([{ q: "Q ?", a: "R." }]),
        html: '<p>Voir <a href="ancien">ancien</a>, <a href="verein">verein</a>, <a href="futur">futur</a> et <a href="https://ticketick.ch/pricing">tarifs</a>.</p><script>alert(1)</script>',
      },
      { ...base, slug: "verein", language: "de", image: "http://insecure.example/x.png", imageAlt: "" },
      { ...base, slug: "sans-langue", language: "" },
      { ...base, slug: "Recent", language: "fr" }, // doublon après mise en minuscules
      { ...base, slug: "../evil", language: "fr" },
    ],
  });
  assert.deepEqual(articles.map((a) => a.slug), ["recent", "verein", "ancien"]);
  const [recent, verein] = articles;
  assert.equal(recent.locale, "fr");
  assert.deepEqual(recent.faq, [{ q: "Q ?", a: "R." }]);
  assert.equal(recent.modifiedAt, "2026-11-19T10:00:00.000Z"); // la plus récente des deux dates
  assert.equal(
    recent.html,
    '<p>Voir <a href="/blog/ancien">ancien</a>, <a href="/de/blog/verein">verein</a>, futur et <a href="/tarifs">tarifs</a>.</p>',
  );
  assert.equal(verein.locale, "de");
  assert.equal(verein.image, null); // couverture hors HTTPS ignorée
  assert.equal(verein.imageAlt, "Titre"); // texte de remplacement par défaut : le titre
});

test("réponse sans liste d'articles : erreur, traitée comme une API indisponible", () => {
  assert.throws(() => prepareArticles({ error: "down" }));
  assert.throws(() => prepareArticles(null));
  assert.deepEqual(prepareArticles({ articles: [] }), []);
});

test("liste : la langue de la page, sinon le français", () => {
  const articles = [{ locale: "fr" as const }, { locale: "de" as const }];
  assert.equal(listingLocale("fr", articles), "fr");
  assert.equal(listingLocale("de", articles), "de");
  assert.equal(listingLocale("en", articles), "fr");
  assert.equal(listingLocale("it", articles), "fr");
  assert.equal(listingLocale("es", articles), "fr");
  assert.deepEqual(localesWithArticles(articles), ["fr", "de"]);
});
