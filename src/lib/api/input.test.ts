import assert from "node:assert/strict";
import { test } from "node:test";
import { toZurichLocal } from "@/lib/zurich-time";
import { parseInstant, schemas, toCents, toStoredText } from "./input";
import { generateApiKey, hashApiKey, isApiKeyShape, readApiKey } from "./keys";

test("heure sans décalage = heure suisse, été comme hiver", () => {
  assert.equal(parseInstant("2026-12-05T20:00").toISOString(), "2026-12-05T19:00:00.000Z");
  assert.equal(parseInstant("2026-07-05T20:00").toISOString(), "2026-07-05T18:00:00.000Z");
  assert.equal(parseInstant("2026-12-05T20:00:00+01:00").toISOString(), "2026-12-05T19:00:00.000Z");
  assert.equal(parseInstant("2026-12-05T19:00:00Z").toISOString(), "2026-12-05T19:00:00.000Z");
  assert.equal(toZurichLocal(new Date("2026-07-05T18:00:00Z")), "2026-07-05T20:00");
});

test("texte : le français est toujours renseigné, au besoin par une autre langue", () => {
  assert.deepEqual(toStoredText({ en: "Concert" }), { fr: "Concert", en: "Concert" });
  assert.deepEqual(toStoredText({ fr: "Concert", de: "Konzert" }), { fr: "Concert", de: "Konzert" });
  assert.deepEqual(toStoredText({ en: "Show", it: "Spettacolo" }), { fr: "Show", en: "Show", it: "Spettacolo" });
});

test("prix en francs : deux décimales au plus", () => {
  assert.equal(toCents(32.5), 3250);
  assert.equal(toCents(19.99), 1999);
  const tt = (price: number) =>
    schemas.addTicketType.safeParse({ sessionId: "s1", name: { fr: "Plein" }, price, quantity: 10 }).success;
  assert.equal(tt(45), true);
  assert.equal(tt(0), true);
  assert.equal(tt(12.345), false);
  assert.equal(tt(-1), false);
});

test("création : spectacle complet accepté, champs inconnus et textes vides refusés", () => {
  const ok = schemas.createEvent.safeParse({
    title: { fr: "Concert de Noël" },
    sessions: [
      {
        startsAt: "2026-12-05T20:00",
        venue: { name: "Temple", city: "Rougemont" },
        ticketTypes: [{ name: { fr: "Plein tarif" }, price: 45, quantity: 250 }],
      },
    ],
    idempotencyKey: "noel-2026-12-05",
  });
  assert.equal(ok.success, true);
  assert.equal(schemas.createEvent.safeParse({ title: {} }).success, false);
  assert.equal(schemas.createEvent.safeParse({ title: { fr: "x" }, status: "PUBLISHED" }).success, false);
  assert.equal(
    schemas.createEvent.safeParse({ title: { fr: "x" }, sessions: [{ startsAt: "5 décembre" }] }).success,
    false,
  );
});

test("mise à jour : tout est facultatif sauf l'identifiant", () => {
  assert.equal(schemas.updateEvent.safeParse({ eventId: "e1" }).success, true);
  assert.equal(schemas.updateEvent.safeParse({ eventId: "e1", visibility: "UNLISTED" }).success, true);
  assert.equal(schemas.updateEvent.safeParse({ title: { fr: "x" } }).success, false);
});

test("recherche publique : la limite arrive en texte depuis l'URL", () => {
  const r = schemas.searchPublic.safeParse({ limit: "5", locale: "en" });
  assert.equal(r.success, true);
  assert.equal(r.success && r.data.limit, 5);
});

test("clés : forme, empreinte stable, lecture des en-têtes", () => {
  const { key, prefix, hash } = generateApiKey();
  assert.equal(isApiKeyShape(key), true);
  assert.equal(prefix, key.slice(0, 11));
  assert.equal(hash, hashApiKey(key));
  assert.notEqual(generateApiKey().key, key);
  assert.equal(isApiKeyShape("tt_court"), false);
  assert.equal(readApiKey(new Headers({ authorization: `Bearer ${key}` })), key);
  assert.equal(readApiKey(new Headers({ "x-api-key": key })), key);
  assert.equal(readApiKey(new Headers()), null);
});
