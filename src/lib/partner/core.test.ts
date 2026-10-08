import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkPartnerSignature,
  emailsMatch,
  maskEmail,
  matchesDate,
  matchesText,
  normalizeReference,
  remainingSeats,
  signPartnerRequest,
} from "./core";

const SECRET = "s".repeat(40);

test("une signature valide et récente est acceptée", () => {
  const now = Date.now();
  const sig = signPartnerRequest(SECRET, String(now), "POST", "/api/partner/v1/orders/lookup", "{}");
  assert.deepEqual(
    checkPartnerSignature({
      secret: SECRET,
      timestamp: String(now),
      signature: sig,
      method: "POST",
      path: "/api/partner/v1/orders/lookup",
      body: "{}",
      now,
    }),
    { ok: true },
  );
});

test("signature fausse, corps modifié, trop ancienne ou secret absent : refus", () => {
  const now = Date.now();
  const sig = signPartnerRequest(SECRET, String(now), "POST", "/x", "{}");
  const base = { secret: SECRET, timestamp: String(now), signature: sig, method: "POST", path: "/x", body: "{}", now };
  assert.equal(checkPartnerSignature({ ...base, body: '{"a":1}' }).ok, false);
  assert.equal(checkPartnerSignature({ ...base, signature: "00" }).ok, false);
  assert.equal(checkPartnerSignature({ ...base, now: now + 10 * 60_000 }).ok, false);
  assert.equal(checkPartnerSignature({ ...base, secret: "court" }).ok, false);
  assert.equal(checkPartnerSignature({ ...base, secret: undefined }).ok, false);
});

test("la référence dictée est normalisée", () => {
  assert.equal(normalizeReference("tt abcd efgh"), "TT-ABCD-EFGH");
  assert.equal(normalizeReference("ABCD-EFGH"), "TT-ABCD-EFGH");
  assert.equal(normalizeReference("TT-ABCD-EFGH"), "TT-ABCD-EFGH");
});

test("e-mail : comparaison sans casse ni espaces, masquage", () => {
  assert.equal(emailsMatch(" Jean@Gmail.com ", "jean@gmail.com"), true);
  assert.equal(emailsMatch("", ""), false);
  assert.equal(emailsMatch("jean@gmail.com", "jeanne@gmail.com"), false);
  assert.equal(maskEmail("jean@gmail.com"), "j***@gmail.com");
});

test("recherche par texte (toutes langues, sans accents) et par date suisse", () => {
  const event = {
    title: { fr: "Concert du Nouvel An", en: "New Year Concert" },
    organizerName: "Gstaad New Year Music Festival",
    venues: ["Église de Rougemont"],
    sessionStarts: [new Date("2026-12-31T22:30:00Z")],
  };
  assert.equal(matchesText(event, "new year rougemont"), true);
  assert.equal(matchesText(event, "eglise"), true);
  assert.equal(matchesText(event, "opéra"), false);
  assert.equal(matchesDate(event.sessionStarts, "2026-12-31"), true);
  assert.equal(matchesDate([new Date("2026-12-31T23:30:00Z")], "2027-01-01"), true);
  assert.equal(matchesDate(event.sessionStarts, "31.12.2026"), false);
});

test("places restantes plafonnées par la jauge", () => {
  assert.equal(remainingSeats([{ quantity: 100, sold: 40 }, { quantity: 10, sold: 10 }], null, 50), 60);
  assert.equal(remainingSeats([{ quantity: 100, sold: 40 }], 50, 45), 5);
});
