import assert from "node:assert/strict";
import { test } from "node:test";
import { promotability, type PromotableEvent } from "./promotable";

const now = new Date("2026-11-01T12:00:00Z");
const inDays = (d: number) => new Date(now.getTime() + d * 24 * 3600 * 1000);
const event: PromotableEvent = {
  status: "PUBLISHED",
  visibility: "PUBLIC",
  onlineSale: true,
  sessions: [{ startsAt: inDays(10), status: "PUBLISHED" }],
};

test("publié, public, séance à venir : promouvable avec attribution", () => {
  assert.deepEqual(promotability(event, now), {
    promotable: true,
    preparable: true,
    blockers: [],
    attribution: true,
  });
  const unlisted = promotability({ ...event, visibility: "UNLISTED" }, now);
  assert.equal(unlisted.promotable, true);
});

test("brouillon : se prépare, ne se programme pas", () => {
  const draft = promotability({ ...event, status: "DRAFT" }, now);
  assert.equal(draft.promotable, false);
  assert.equal(draft.preparable, true);
  assert.deepEqual(draft.blockers, ["draft"]);

  const noDate = promotability({ ...event, status: "DRAFT", sessions: [] }, now);
  assert.deepEqual(noDate.blockers, ["draft", "noSession"]);
  assert.equal(noDate.preparable, true);
});

test("événement passé : ni statut PAST ni séances échues", () => {
  const past = promotability({ ...event, status: "PAST" }, now);
  assert.deepEqual(past.blockers, ["past"]);
  assert.equal(past.preparable, false);

  const over = promotability({ ...event, sessions: [{ startsAt: inDays(-1), status: "PUBLISHED" }] }, now);
  assert.equal(over.promotable, false);
  assert.deepEqual(over.blockers, ["past"]);

  const startingNow = promotability({ ...event, sessions: [{ startsAt: now, status: "PUBLISHED" }] }, now);
  assert.deepEqual(startingNow.blockers, ["past"]);
});

test("une seule séance à venir suffit ; dates en texte acceptées", () => {
  const mixed = promotability(
    {
      ...event,
      sessions: [
        { startsAt: inDays(-30), status: "PUBLISHED" },
        { startsAt: inDays(5).toISOString(), status: "PUBLISHED" },
      ],
    },
    now,
  );
  assert.equal(mixed.promotable, true);
});

test("MEMBERS : jamais, même publié, même en brouillon", () => {
  const members = promotability({ ...event, visibility: "MEMBERS" }, now);
  assert.equal(members.promotable, false);
  assert.deepEqual(members.blockers, ["members"]);
  assert.equal(members.preparable, false);

  const draftMembers = promotability({ ...event, status: "DRAFT", visibility: "MEMBERS" }, now);
  assert.equal(draftMembers.preparable, false);
});

test("annulé, ou seules séances à venir annulées", () => {
  const cancelled = promotability({ ...event, status: "CANCELLED" }, now);
  assert.deepEqual(cancelled.blockers, ["cancelled"]);
  assert.equal(cancelled.preparable, false);

  const sessionCancelled = promotability(
    { ...event, sessions: [{ startsAt: inDays(3), status: "CANCELLED" }] },
    now,
  );
  assert.deepEqual(sessionCancelled.blockers, ["past"]);
});

test("complet : l'événement ou toutes ses séances à venir", () => {
  assert.deepEqual(promotability({ ...event, status: "SOLD_OUT" }, now).blockers, ["soldOut"]);
  const full = promotability(
    {
      ...event,
      sessions: [
        { startsAt: inDays(3), status: "SOLD_OUT" },
        { startsAt: inDays(-3), status: "PUBLISHED" },
      ],
    },
    now,
  );
  assert.deepEqual(full.blockers, ["sessionsSoldOut"]);

  const oneLeft = promotability(
    {
      ...event,
      sessions: [
        { startsAt: inDays(3), status: "SOLD_OUT" },
        { startsAt: inDays(4), status: "PUBLISHED" },
      ],
    },
    now,
  );
  assert.equal(oneLeft.promotable, true);
});

test("sans vente en ligne : promouvable, attribution sans objet", () => {
  const offline = promotability({ ...event, onlineSale: false }, now);
  assert.equal(offline.promotable, true);
  assert.equal(offline.attribution, false);
});
