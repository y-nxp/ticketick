import { test } from "node:test";
import assert from "node:assert/strict";
import { rewriteHref, sanitizeArticleHtml } from "./sanitize";

const paths = new Map([
  ["twint-billetterie", "/blog/twint-billetterie"],
  ["online-ticketing-verein", "/de/blog/online-ticketing-verein"],
]);

test("liste blanche : balises gardées, attributs et scripts retirés", () => {
  assert.equal(
    sanitizeArticleHtml('<p class="x" onclick="evil()">Un <strong>gras</strong> <em>et</em> <span>texte</span></p>'),
    "<p>Un <strong>gras</strong> <em>et</em> texte</p>",
  );
  assert.equal(sanitizeArticleHtml("<p>a</p><script>alert(1)</script><style>p{}</style><iframe src=x></iframe><p>b</p>"), "<p>a</p><p>b</p>");
  assert.equal(sanitizeArticleHtml("<p>a<!-- commentaire --></p>"), "<p>a</p>");
  assert.equal(sanitizeArticleHtml("<h1>Titre</h1>"), "<h2>Titre</h2>");
  assert.equal(sanitizeArticleHtml("<img src=x onerror=alert(1)>"), "");
  assert.equal(
    sanitizeArticleHtml('<img src="https://manager.nextalp.com/a.png" alt="Salle">'),
    '<img src="https://manager.nextalp.com/a.png" alt="Salle" loading="lazy" decoding="async">',
  );
  assert.equal(sanitizeArticleHtml("<p>1 < 2 et 3 > 2</p>"), "<p>1 &lt; 2 et 3 &gt; 2</p>");
  assert.equal(sanitizeArticleHtml('<p title="a&quot;b">x</p>'), "<p>x</p>");
});

test("balises équilibrées", () => {
  assert.equal(sanitizeArticleHtml("<ul><li>a<li>b</ul>"), "<ul><li>a</li><li>b</li></ul>");
  assert.equal(sanitizeArticleHtml("<p>ouvert"), "<p>ouvert</p>");
  assert.equal(sanitizeArticleHtml("</p>orphelin"), "orphelin");
});

test("tableaux enveloppés pour défiler sur mobile", () => {
  assert.equal(
    sanitizeArticleHtml('<table><thead><tr><th scope="col" style="x">A</th></tr></thead><tbody><tr><td colspan="2">1</td></tr></tbody></table>'),
    '<div class="article-table"><table><thead><tr><th scope="col">A</th></tr></thead><tbody><tr><td colspan="2">1</td></tr></tbody></table></div>',
  );
  assert.equal(sanitizeArticleHtml("<table><tr><td>x"), '<div class="article-table"><table><tr><td>x</td></tr></table></div>');
});

test("liens : articles, pages du site, externes, schémas refusés", () => {
  assert.deepEqual(rewriteHref("twint-billetterie", paths), { href: "/blog/twint-billetterie", external: false });
  assert.deepEqual(rewriteHref("online-ticketing-verein#faq", paths), { href: "/de/blog/online-ticketing-verein#faq", external: false });
  // Lien d'une langue vers un article de l'autre : directement à la bonne adresse.
  assert.deepEqual(rewriteHref("/de/blog/twint-billetterie", paths), { href: "/blog/twint-billetterie", external: false });
  assert.deepEqual(rewriteHref("https://ticketick.ch/blog/online-ticketing-verein", paths), { href: "/de/blog/online-ticketing-verein", external: false });
  assert.equal(rewriteHref("article-pas-encore-publie", paths), null);
  assert.deepEqual(rewriteHref("https://ticketick.ch/pricing"), { href: "/tarifs", external: false });
  assert.deepEqual(rewriteHref("https://ticketick.ch/de/pricing"), { href: "/de/preise", external: false });
  assert.deepEqual(rewriteHref("https://ticketick.ch/organizer#contact"), { href: "/organisateurs#contact", external: false });
  assert.deepEqual(rewriteHref("https://ticketick.ch/de/organizer#contact"), { href: "/de/veranstalter#contact", external: false });
  assert.deepEqual(rewriteHref("https://ticketick.ch/developers"), { href: "/developers", external: false });
  assert.deepEqual(rewriteHref("https://ticketick.ch/"), { href: "/", external: false });
  assert.deepEqual(rewriteHref("https://www.fedlex.admin.ch/eli/cc/2022/491/fr"), { href: "https://www.fedlex.admin.ch/eli/cc/2022/491/fr", external: true });
  assert.deepEqual(rewriteHref("mailto:support@ticketick.ch"), { href: "mailto:support@ticketick.ch", external: false });
  assert.equal(rewriteHref("javascript:alert(1)"), null);
  assert.equal(rewriteHref("java\tscript:alert(1)"), null);
  assert.equal(rewriteHref("data:text/html,x"), null);
});

test("liens dans le HTML : réécrits, refusés ou ouverts dans un nouvel onglet", () => {
  assert.equal(
    sanitizeArticleHtml('<p><a href="twint-billetterie">TWINT</a> · <a href="https://ticketick.ch/pricing">tarifs</a></p>', { articlePaths: paths }),
    '<p><a href="/blog/twint-billetterie">TWINT</a> · <a href="/tarifs">tarifs</a></p>',
  );
  assert.equal(sanitizeArticleHtml('<a href="javascript&#58;alert(1)">x</a>'), "x");
  assert.equal(sanitizeArticleHtml('<p><a href="inconnu">texte</a> suite</p>'), "<p>texte suite</p>");
  assert.equal(
    sanitizeArticleHtml('<a href="https://example.com" target="_self">x</a>'),
    '<a href="https://example.com/" target="_blank" rel="noopener noreferrer">x</a>',
  );
  assert.equal(
    sanitizeArticleHtml('<a href="/x"><a href="/y">y</a>z</a>'),
    '<a href="/x">yz</a>',
  );
});
