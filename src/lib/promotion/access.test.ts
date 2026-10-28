import assert from "node:assert/strict";
import { test } from "node:test";
import type { UserRole } from "@prisma/client";
import { canSeePromotionUi } from "@/lib/admin/promotion-visibility";
import { mayReadPromotion, mayWritePromotion, promotionScope, type PromotionActor } from "./access";

const actor = (role: UserRole, over: Partial<PromotionActor> = {}): PromotionActor => ({
  role,
  organizerId: null,
  statsOrganizerId: null,
  ...over,
});

const admin = actor("ADMIN");
const organizer = actor("ORGANIZER", { organizerId: "org-a" });
const viewer = actor("ORGANIZER_VIEWER", { statsOrganizerId: "org-a" });

test("admin : compose et lit pour tout organisateur", () => {
  assert.deepEqual(promotionScope(admin), { read: true, write: true, organizerId: null });
  assert.equal(mayWritePromotion(admin, "org-a"), true);
  assert.equal(mayWritePromotion(admin, "org-b"), true);
});

test("organisateur : limité à ses événements, refusé chez un autre", () => {
  assert.equal(mayWritePromotion(organizer, "org-a"), true);
  assert.equal(mayReadPromotion(organizer, "org-a"), true);
  assert.equal(mayWritePromotion(organizer, "org-b"), false);
  assert.equal(mayReadPromotion(organizer, "org-b"), false);
  // Compte organisateur sans fiche liée : rien.
  assert.deepEqual(promotionScope(actor("ORGANIZER")), { read: false, write: false, organizerId: null });
});

test("responsable invité : lecture de son organisateur, jamais d'écriture", () => {
  assert.equal(mayReadPromotion(viewer, "org-a"), true);
  assert.equal(mayWritePromotion(viewer, "org-a"), false);
  assert.equal(mayReadPromotion(viewer, "org-b"), false);
  assert.equal(mayReadPromotion(actor("ORGANIZER_VIEWER"), "org-a"), false);
});

test("autres rôles : aucun accès, même avec un organisateur rattaché", () => {
  for (const role of ["DOOR_STAFF", "RESELLER_AGENT", "CUSTOMER"] as const) {
    const someone = actor(role, { organizerId: "org-a", statsOrganizerId: "org-a" });
    assert.equal(mayReadPromotion(someone, "org-a"), false, role);
    assert.equal(mayWritePromotion(someone, "org-a"), false, role);
  }
});

test("affichage des entrées : ADMIN seulement, tant que l'OAuth manque", () => {
  assert.equal(canSeePromotionUi({ role: "ADMIN" }), true);
  for (const role of ["ORGANIZER", "ORGANIZER_VIEWER", "DOOR_STAFF", "RESELLER_AGENT", "CUSTOMER"] as const) {
    assert.equal(canSeePromotionUi({ role }), false, role);
  }
  assert.equal(canSeePromotionUi(null), false);
});
