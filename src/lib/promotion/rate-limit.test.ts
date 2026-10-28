import assert from "node:assert/strict";
import { test } from "node:test";
import { INSTAGRAM_POSTS_PER_WINDOW, postsPerWindow, rateDecision, RATE_WINDOW_MS } from "./rate-limit";

const NOW = new Date("2026-11-02T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const HOUR = 60 * 60 * 1000;

test("limite Instagram : 50 par 24 h (fait Meta du 28.10.2026) ; aucune pour Facebook", () => {
  assert.equal(INSTAGRAM_POSTS_PER_WINDOW, 50);
  assert.equal(postsPerWindow("INSTAGRAM_BUSINESS"), 50);
  assert.equal(postsPerWindow("FACEBOOK_PAGE"), null);
  assert.equal(postsPerWindow("TIKTOK"), null);
});

test("49 dans la fenêtre : le 50ᵉ passe", () => {
  const recent = Array.from({ length: 49 }, (_, i) => ago(i * HOUR * 0.4));
  assert.deepEqual(rateDecision("INSTAGRAM_BUSINESS", recent, NOW), { ok: true });
});

test("50 dans la fenêtre : le 51ᵉ attend la sortie de la plus ancienne", () => {
  const oldest = ago(23 * HOUR);
  const recent = [oldest, ...Array.from({ length: 49 }, (_, i) => ago(i * 60 * 1000))];
  const decision = rateDecision("INSTAGRAM_BUSINESS", recent, NOW);
  assert.equal(decision.ok, false);
  if (decision.ok) return;
  assert.deepEqual(decision.retryAt, new Date(oldest.getTime() + RATE_WINDOW_MS));
  assert.deepEqual(decision.retryAt, new Date(NOW.getTime() + HOUR));
  assert.equal(decision.count, 50);
  // À l'heure dite, la plus ancienne est sortie : la fenêtre est glissante.
  assert.deepEqual(rateDecision("INSTAGRAM_BUSINESS", recent, decision.retryAt), { ok: true });
});

test("au-delà de 50 (deux instances) : attendre qu'il en reste 49", () => {
  const recent = Array.from({ length: 52 }, (_, i) => ago((23 - i * 0.1) * HOUR));
  const decision = rateDecision("INSTAGRAM_BUSINESS", recent, NOW);
  assert.equal(decision.ok, false);
  if (decision.ok) return;
  const sorted = recent.map((d) => d.getTime()).sort((a, b) => a - b);
  assert.equal(decision.retryAt.getTime(), sorted[2]! + RATE_WINDOW_MS);
  assert.deepEqual(rateDecision("INSTAGRAM_BUSINESS", recent, decision.retryAt), { ok: true });
});

test("hors fenêtre : ignorées ; Facebook n'est jamais limité", () => {
  const old = Array.from({ length: 80 }, () => ago(25 * HOUR));
  assert.deepEqual(rateDecision("INSTAGRAM_BUSINESS", old, NOW), { ok: true });
  const many = Array.from({ length: 80 }, () => ago(HOUR));
  assert.deepEqual(rateDecision("FACEBOOK_PAGE", many, NOW), { ok: true });
});
