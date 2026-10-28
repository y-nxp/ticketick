import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parsePromotionCookie,
  PROMOTION_COOKIE,
  PROMOTION_COOKIE_OPTIONS,
  serializePromotionCookie,
} from "./cookie";

const clickAt = new Date("2026-10-28T09:30:00Z");

test("aller-retour : code, source et horodatage, rien d'autre", () => {
  const value = serializePromotionCookie({ code: "abcdefgh", source: "instagram", clickAt });
  assert.equal(value, `abcdefgh.instagram.${clickAt.getTime()}`);
  assert.deepEqual(parsePromotionCookie(value), { code: "abcdefgh", source: "instagram", clickAt });
});

test("cookie absent ou vide : ignoré", () => {
  assert.equal(parsePromotionCookie(undefined), null);
  assert.equal(parsePromotionCookie(null), null);
  assert.equal(parsePromotionCookie(""), null);
});

test("cookie malformé : ignoré sans erreur", () => {
  for (const value of [
    "abcdefgh",
    "abcdefgh.facebook",
    "abcdefgh.facebook.123.4",
    "ABC.facebook.123",
    "abcdefg0.facebook.123", // 0 hors alphabet
    "abcdefgh.twitter.123", // source hors liste
    "abcdefgh.facebook.-5",
    "abcdefgh.facebook.12e5",
    "abcdefgh.facebook.",
    "abcdefgh.facebook.9999999999999999999",
    '{"code":"abcdefgh"}',
  ]) {
    assert.equal(parsePromotionCookie(value), null, value);
  }
});

test("un code en majuscules est normalisé", () => {
  assert.equal(parsePromotionCookie("ABCDEFGH.code.1")?.code, "abcdefgh");
});

test("attributs : première partie, 7 jours, lu par le serveur seulement", () => {
  assert.equal(PROMOTION_COOKIE, "tt_cmp");
  assert.deepEqual(PROMOTION_COOKIE_OPTIONS, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60,
  });
});
