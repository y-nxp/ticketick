import { test } from "node:test";
import assert from "node:assert/strict";
import { entryOpensAt, isEntryOpen } from "./entry-window";

test("entry opens two hours before the session starts", () => {
  const startsAt = "2026-12-26T18:00:00.000Z";
  assert.equal(new Date(entryOpensAt(startsAt)).toISOString(), "2026-12-26T16:00:00.000Z");
  assert.equal(isEntryOpen(startsAt, Date.parse("2026-12-26T15:59:59Z")), false);
  assert.equal(isEntryOpen(startsAt, Date.parse("2026-12-26T16:00:00Z")), true);
  // Séance commencée : l'entrée reste ouverte.
  assert.equal(isEntryOpen(startsAt, Date.parse("2026-12-26T20:30:00Z")), true);
});
