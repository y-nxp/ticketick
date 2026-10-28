import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkComposition,
  eventImages,
  type ComposeAccount,
  type ComposeEvent,
  type ComposeRequest,
} from "./compose";

const now = new Date("2026-11-01T12:00:00Z");
const inDays = (d: number) => new Date(now.getTime() + d * 24 * 3600 * 1000);

const event: ComposeEvent = {
  organizerId: "org-a",
  status: "PUBLISHED",
  visibility: "PUBLIC",
  onlineSale: true,
  coverImage: "/uploads/events/cover.png",
  gallery: ["/uploads/events/g1.jpg", "/uploads/events/cover.png"],
  sessions: [
    { id: "s-past", startsAt: inDays(-3), status: "PUBLISHED" },
    { id: "s1", startsAt: inDays(10), status: "PUBLISHED" },
    { id: "s-cancelled", startsAt: inDays(12), status: "CANCELLED" },
  ],
};

// Comptes tels que les tests les créeraient en base (OrganizerSocialAccount).
const facebook: ComposeAccount = { id: "fb", organizerId: "org-a", provider: "FACEBOOK_PAGE", status: "ACTIVE" };
const instagram: ComposeAccount = { id: "ig", organizerId: "org-a", provider: "INSTAGRAM_BUSINESS", status: "ACTIVE" };
const foreign: ComposeAccount = { id: "fb-b", organizerId: "org-b", provider: "FACEBOOK_PAGE", status: "ACTIVE" };
const stale: ComposeAccount = { id: "fb-old", organizerId: "org-a", provider: "FACEBOOK_PAGE", status: "NEEDS_RECONNECT" };
const tiktok: ComposeAccount = { id: "tt", organizerId: "org-a", provider: "TIKTOK", status: "ACTIVE" };
const accounts = [facebook, instagram, foreign, stale, tiktok];

const request: ComposeRequest = {
  sessionId: "s1",
  locale: "de",
  landing: "go",
  name: "  Requiem — novembre  ",
  accountIds: ["fb", "ig"],
  image: "/uploads/events/cover.png",
  body: "Requiem",
  intent: "schedule",
  scheduledAt: inDays(2),
};
const short = () => "Requiem\n\n👉 https://ticketick.ch/p/xxxxxxxx?s=fb";

function check(over: Partial<ComposeRequest> = {}, ev: ComposeEvent = event) {
  return checkComposition(ev, accounts, { ...request, ...over }, short, now);
}

test("composition valide : une publication par compte, programmée", () => {
  assert.deepEqual(check(), {
    ok: true,
    sessionId: "s1",
    locale: "de",
    landing: "go",
    name: "Requiem — novembre",
    image: "/uploads/events/cover.png",
    posts: [
      { accountId: "fb", channel: "facebook" },
      { accountId: "ig", channel: "instagram" },
    ],
    status: "SCHEDULED",
    scheduledAt: inDays(2),
  });
  const allDates = check({ sessionId: null, intent: "now", scheduledAt: null });
  assert.equal(allDates.ok && allDates.sessionId, null);
  assert.deepEqual(allDates.ok && allDates.scheduledAt, now);
});

test("compte d'un autre organisateur, à reconnecter ou non pris en charge : refusé", () => {
  assert.deepEqual(check({ accountIds: ["fb", "fb-b"] }), { ok: false, error: "accountInvalid" });
  assert.deepEqual(check({ accountIds: ["fb-old"] }), { ok: false, error: "accountInvalid" });
  assert.deepEqual(check({ accountIds: ["tt"] }), { ok: false, error: "accountInvalid" });
  assert.deepEqual(check({ accountIds: ["inconnu"] }), { ok: false, error: "accountInvalid" });
  assert.deepEqual(check({ accountIds: [] }), { ok: false, error: "channelRequired" });
  // Doublon : une seule publication.
  const twice = check({ accountIds: ["fb", "fb"] });
  assert.equal(twice.ok && twice.posts.length, 1);
});

test("visuel : seulement une image de l'événement ; Instagram en exige une", () => {
  assert.equal(check({ image: "/uploads/events/g1.jpg" }).ok, true);
  assert.deepEqual(check({ image: "/uploads/autre-organisateur/x.png" }), { ok: false, error: "imageInvalid" });
  assert.deepEqual(check({ image: null }), { ok: false, error: "imageRequired" });
  assert.equal(check({ image: null, accountIds: ["fb"] }).ok, true);
  assert.deepEqual(eventImages(event), ["/uploads/events/cover.png", "/uploads/events/g1.jpg"]);
});

test("séance : de l'événement, à venir, ni annulée", () => {
  assert.deepEqual(check({ sessionId: "s-past" }), { ok: false, error: "sessionInvalid" });
  assert.deepEqual(check({ sessionId: "s-cancelled" }), { ok: false, error: "sessionInvalid" });
  assert.deepEqual(check({ sessionId: "s-autre-evenement" }), { ok: false, error: "sessionInvalid" });
});

test("langue, page d'arrivée, nom et texte vérifiés", () => {
  assert.deepEqual(check({ locale: "es" }), { ok: false, error: "localeInvalid" });
  assert.deepEqual(check({ landing: "ailleurs" }), { ok: false, error: "landingInvalid" });
  assert.deepEqual(check({ name: "   " }), { ok: false, error: "nameRequired" });
  assert.deepEqual(check({ body: " \n " }), { ok: false, error: "messageRequired" });
  const long = (channel: string) => "x".repeat(channel === "instagram" ? 2201 : 10);
  assert.deepEqual(checkComposition(event, accounts, request, long, now), { ok: false, error: "messageTooLong" });
  assert.equal(checkComposition(event, accounts, { ...request, accountIds: ["fb"] }, long, now).ok, true);
});

test("événement brouillon : brouillon de publication permis, programmation refusée", () => {
  const draftEvent: ComposeEvent = { ...event, status: "DRAFT" };
  assert.equal(check({ intent: "draft" }, draftEvent).ok, true);
  assert.deepEqual(check({ intent: "schedule" }, draftEvent), { ok: false, error: "notPromotable" });
  assert.deepEqual(check({ intent: "now" }, draftEvent), { ok: false, error: "notPromotable" });
});

test("réservé à une communauté ou annulé : rien, pas même un brouillon", () => {
  assert.deepEqual(check({ intent: "draft" }, { ...event, visibility: "MEMBERS" }), {
    ok: false,
    error: "notPreparable",
  });
  assert.deepEqual(check({ intent: "draft" }, { ...event, status: "CANCELLED" }), {
    ok: false,
    error: "notPreparable",
  });
});

test("sans vente en ligne : promouvable, la composition passe", () => {
  assert.equal(check({}, { ...event, onlineSale: false }).ok, true);
});
