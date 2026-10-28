import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { serializePromotionCookie } from "./cookie";
import { campaignLink, landingClick } from "./proxy-rules";

const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const now = new Date("2026-10-28T12:00:00Z");

test("/p/{code} : format validé, sans base", () => {
  assert.deepEqual(campaignLink("/p/abcdefgh"), { code: "abcdefgh" });
  assert.deepEqual(campaignLink("/p/abcdefgh/"), { code: "abcdefgh" });
  assert.deepEqual(campaignLink("/p/ABCDEFGH"), { code: "abcdefgh" });
});

test("/p/ mal formé : vers l'accueil", () => {
  for (const path of ["/p", "/p/", "/p/abc", "/p/abcdefgh0", "/p/abcdefg1", "/p/abcdefgh/x", "/p/%27or1"]) {
    assert.deepEqual(campaignLink(path), { code: null }, path);
  }
});

test("autres chemins : pas un lien de campagne", () => {
  for (const path of ["/", "/pay/TT-AAAA", "/pos", "/privacy", "/go/org/event", "/fr/p/abcdefgh"]) {
    assert.equal(campaignLink(path), null, path);
  }
});

test("le proxy et ses règles n'importent pas Prisma", () => {
  for (const file of ["src/proxy.ts", "src/lib/promotion/proxy-rules.ts", "src/lib/promotion/cookie.ts", "src/lib/promotion/campaign-code.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /@prisma\/client|@\/lib\/prisma|\/prisma"/, file);
  }
});

function arrive(url: string, currentCookie?: string, userAgent: string | null = BROWSER) {
  const parsed = new URL(url, "https://ticketick.ch");
  return landingClick({
    pathname: parsed.pathname,
    searchParams: parsed.searchParams,
    currentCookie,
    userAgent,
    now,
  });
}

test("/go/… avec utm_campaign=tt-… : le clic est mémorisé", () => {
  assert.deepEqual(arrive("/go/org/event?utm_source=instagram&utm_campaign=tt-abcdefgh"), {
    code: "abcdefgh",
    source: "instagram",
    clickAt: now,
  });
  assert.equal(arrive("/events/requiem?utm_campaign=tt-abcdefgh")?.source, "link");
});

test("sans utm_campaign de ticketick : rien", () => {
  assert.equal(arrive("/go/org/event"), null);
  assert.equal(arrive("/go/org/event?utm_campaign=noel2026"), null);
  assert.equal(arrive("/go/org/event?utm_campaign=tt-abc"), null);
  assert.equal(arrive("/cart?utm_campaign=tt-abcdefgh"), null);
});

test("même code déjà mémorisé (arrivée depuis /p/, rechargement) : horodatage conservé", () => {
  const cookie = serializePromotionCookie({ code: "abcdefgh", source: "facebook", clickAt: new Date("2026-10-25T08:00:00Z") });
  assert.equal(arrive("/go/org/event?utm_campaign=tt-abcdefgh", cookie), null);
});

test("autre campagne : le dernier clic remplace le précédent", () => {
  const cookie = serializePromotionCookie({ code: "abcdefgh", source: "facebook", clickAt: new Date("2026-10-25T08:00:00Z") });
  assert.equal(arrive("/go/org/event?utm_campaign=tt-zzzzzzzz", cookie)?.code, "zzzzzzzz");
});

test("robot : pas de cookie", () => {
  assert.equal(arrive("/go/org/event?utm_campaign=tt-abcdefgh", undefined, "facebookexternalhit/1.1"), null);
  assert.equal(arrive("/go/org/event?utm_campaign=tt-abcdefgh", undefined, null), null);
});
