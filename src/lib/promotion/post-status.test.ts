import assert from "node:assert/strict";
import { test } from "node:test";
import type { PromotionPostStatus } from "@prisma/client";
import {
  editablePostWhere,
  isPostEditable,
  isPostIntent,
  MIN_SCHEDULE_LEAD_MS,
  planCancel,
  planPostStatus,
} from "./post-status";

const now = new Date("2026-11-01T12:00:00Z");
const later = new Date("2026-11-03T18:00:00Z");
const draft = { status: "DRAFT" as const, claimedAt: null };
const scheduled = { status: "SCHEDULED" as const, claimedAt: null };

test("brouillon : se garde avec ou sans date, même si l'événement n'est pas promouvable", () => {
  assert.deepEqual(planPostStatus({ intent: "draft", scheduledAt: null, promotable: false, now }), {
    ok: true,
    status: "DRAFT",
    scheduledAt: null,
  });
  assert.deepEqual(planPostStatus({ intent: "draft", scheduledAt: later, promotable: true, now, current: draft }), {
    ok: true,
    status: "DRAFT",
    scheduledAt: later,
  });
});

test("DRAFT → SCHEDULED : date future exigée, promouvabilité revérifiée", () => {
  assert.deepEqual(planPostStatus({ intent: "schedule", scheduledAt: later, promotable: true, now, current: draft }), {
    ok: true,
    status: "SCHEDULED",
    scheduledAt: later,
  });
  assert.deepEqual(planPostStatus({ intent: "schedule", scheduledAt: null, promotable: true, now }), {
    ok: false,
    error: "scheduleRequired",
  });
  assert.deepEqual(
    planPostStatus({ intent: "schedule", scheduledAt: new Date(now.getTime() - 1000), promotable: true, now }),
    { ok: false, error: "scheduleInPast" },
  );
  // Une date « dans quelques secondes » serait passée avant d'arriver.
  assert.deepEqual(
    planPostStatus({
      intent: "schedule",
      scheduledAt: new Date(now.getTime() + MIN_SCHEDULE_LEAD_MS - 1),
      promotable: true,
      now,
    }),
    { ok: false, error: "scheduleInPast" },
  );
  assert.deepEqual(planPostStatus({ intent: "schedule", scheduledAt: later, promotable: false, now }), {
    ok: false,
    error: "notPromotable",
  });
});

test("publier maintenant : SCHEDULED à l'instant, la minuterie prend le relais", () => {
  assert.deepEqual(planPostStatus({ intent: "now", scheduledAt: later, promotable: true, now, current: draft }), {
    ok: true,
    status: "SCHEDULED",
    scheduledAt: now,
  });
  assert.deepEqual(planPostStatus({ intent: "now", scheduledAt: null, promotable: false, now }), {
    ok: false,
    error: "notPromotable",
  });
});

test("SCHEDULED → DRAFT ou reprogrammée, tant que la minuterie ne l'a pas prise", () => {
  assert.equal(planPostStatus({ intent: "draft", scheduledAt: later, promotable: true, now, current: scheduled }).ok, true);
  assert.equal(planPostStatus({ intent: "schedule", scheduledAt: later, promotable: true, now, current: scheduled }).ok, true);

  const claimed = { status: "SCHEDULED" as const, claimedAt: now };
  assert.deepEqual(planPostStatus({ intent: "draft", scheduledAt: null, promotable: true, now, current: claimed }), {
    ok: false,
    error: "postLocked",
  });
});

test("annulation : DRAFT et SCHEDULED seulement, jamais après la prise en charge", () => {
  assert.deepEqual(planCancel(draft), { ok: true });
  assert.deepEqual(planCancel(scheduled), { ok: true });
  assert.deepEqual(planCancel({ status: "SCHEDULED", claimedAt: now }), { ok: false, error: "postLocked" });

  const locked: PromotionPostStatus[] = ["PUBLISHING", "PUBLISHED", "FAILED", "CANCELLED"];
  for (const status of locked) {
    assert.equal(isPostEditable({ status, claimedAt: null }), false, status);
    assert.deepEqual(planCancel({ status, claimedAt: null }), { ok: false, error: "postLocked" }, status);
    assert.deepEqual(
      planPostStatus({ intent: "schedule", scheduledAt: later, promotable: true, now, current: { status, claimedAt: null } }),
      { ok: false, error: "postLocked" },
      status,
    );
  }
});

test("écriture conditionnelle : statut modifiable et aucune réservation", () => {
  assert.deepEqual(editablePostWhere("p1"), {
    id: "p1",
    status: { in: ["DRAFT", "SCHEDULED"] },
    claimedAt: null,
  });
});

test("intentions : liste fermée", () => {
  assert.equal(isPostIntent("schedule"), true);
  assert.equal(isPostIntent("now"), true);
  assert.equal(isPostIntent("draft"), true);
  assert.equal(isPostIntent("publish"), false);
  assert.equal(isPostIntent(""), false);
});
