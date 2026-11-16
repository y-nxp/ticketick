import assert from "node:assert/strict";
import { test } from "node:test";
import type { DoorSnapshot, DoorSnapshotTicket } from "./actions";
import { indexSnapshot, localCounts, localLookup, type PendingEntry } from "./offline";

function ticket(code: string, status: DoorSnapshotTicket["status"], usedAt: string | null = null): DoorSnapshotTicket {
  return {
    code,
    status,
    usedAt,
    ticketName: "Plein tarif",
    seat: null,
    buyer: "Marie Dupont",
    attendee: null,
    attendeeBirthDate: null,
  };
}

const snapshot: DoorSnapshot = {
  sessionId: "s1",
  eventTitle: "Récital",
  when: "2 janv. 2027, 19:00",
  venue: "Gstaad",
  at: "2026-11-16T18:00:00.000Z",
  tickets: [
    ticket("VAL1", "V"),
    ticket("VAL2", "V"),
    ticket("USE1", "U", "2026-11-16T18:30:00.000Z"),
    ticket("ANN1", "X"),
    ticket("PEN1", "P"),
  ],
};
const index = indexSnapshot(snapshot);

test("hors liste : le serveur décide", () => {
  assert.deepEqual(localLookup(snapshot, index, [], "AUTRE", "entry"), { kind: "missing" });
  assert.deepEqual(localLookup(null, new Map(), [], "VAL1", "entry"), { kind: "missing" });
});

test("entrée : un billet valable est admis et part dans la file", () => {
  const r = localLookup(snapshot, index, [], "VAL1", "entry");
  assert.equal(r.kind, "found");
  if (r.kind !== "found") return;
  assert.equal(r.admit, true);
  assert.equal(r.lookup.ok && r.lookup.outcome, "admitted");
});

test("vérifier : valable, rien à enregistrer", () => {
  const r = localLookup(snapshot, index, [], "VAL1", "check");
  assert.ok(r.kind === "found" && !r.admit && r.lookup.ok && r.lookup.outcome === "valid");
});

test("déjà passé : sur le serveur, ou sur ce téléphone pas encore envoyé", () => {
  const serveur = localLookup(snapshot, index, [], "USE1", "entry");
  assert.ok(serveur.kind === "found" && serveur.lookup.ok && serveur.lookup.outcome === "already");
  assert.equal(serveur.kind === "found" && serveur.lookup.ok && serveur.lookup.usedAt, "2026-11-16T18:30:00.000Z");

  const pending: PendingEntry[] = [{ code: "VAL2", at: "2026-11-16T18:40:00.000Z" }];
  const local = localLookup(snapshot, index, pending, "VAL2", "entry");
  assert.ok(local.kind === "found" && !local.admit && local.lookup.ok && local.lookup.outcome === "already");
  assert.equal(local.kind === "found" && local.lookup.ok && local.lookup.usedAt, "2026-11-16T18:40:00.000Z");
});

test("annulé et non payé : refusés sur place", () => {
  const a = localLookup(snapshot, index, [], "ANN1", "entry");
  assert.ok(a.kind === "found" && !a.lookup.ok && a.lookup.reason === "cancelled");
  const p = localLookup(snapshot, index, [], "PEN1", "check");
  assert.ok(p.kind === "found" && !p.lookup.ok && p.lookup.reason === "unpaid");
});

test("compteur : passés + entrées en attente, sur les billets valables", () => {
  assert.deepEqual(localCounts(snapshot, index, []), { entered: 1, expected: 3 });
  const pending = [{ code: "VAL1", at: "x" }, { code: "ANN1", at: "x" }];
  assert.deepEqual(localCounts(snapshot, index, pending), { entered: 2, expected: 3 });
});
