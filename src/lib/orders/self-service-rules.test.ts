import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cancelOpen,
  changeOpen,
  checkBasket,
  exchangeDue,
  exchangeRuleError,
  holderKey,
  holdersKept,
  tariffRoom,
} from "./self-service-rules";

const now = new Date("2026-12-20T12:00:00Z");
const inHours = (h: number) => new Date(now.getTime() + h * 3600 * 1000);
const event = { selfChange: true, changeUntilHours: 24, selfCancelFree: true, cancelUntilHours: 48 };

test("le lien de l'organisateur vaut jusqu'au début, sans réglage", () => {
  const off = { ...event, selfChange: false };
  assert.equal(changeOpen({ startsAt: inHours(1), event: off, viaAccount: false, now }), true);
  assert.equal(changeOpen({ startsAt: inHours(-1), event: off, viaAccount: false, now }), false);
});

test("depuis le compte : réglage du spectacle et délai", () => {
  assert.equal(changeOpen({ startsAt: inHours(25), event, viaAccount: true, now }), true);
  assert.equal(changeOpen({ startsAt: inHours(23), event, viaAccount: true, now }), false);
  assert.equal(
    changeOpen({ startsAt: inHours(100), event: { ...event, selfChange: false }, viaAccount: true, now }),
    false,
  );
});

test("seules les places gratuites s'annulent, avant le délai", () => {
  assert.equal(cancelOpen({ startsAt: inHours(49), paidCents: 0, event, now }), true);
  assert.equal(cancelOpen({ startsAt: inHours(47), paidCents: 0, event, now }), false);
  assert.equal(cancelOpen({ startsAt: inHours(100), paidCents: 1000, event, now }), false);
  assert.equal(
    cancelOpen({ startsAt: inHours(100), paidCents: 0, event: { ...event, selfCancelFree: false }, now }),
    false,
  );
});

const full = { available: 50, maxPerOrder: 10, maxPerPaidTicket: null, companionOfId: null, requiresAttendee: false };
const tariffs = [
  { ...full, id: "cat1", priceCents: 9000 },
  { ...full, id: "cat2", priceCents: 6000 },
  { ...full, id: "youth", priceCents: 0, maxPerPaidTicket: 2, requiresAttendee: true },
];

test("panier d'échange : stock et accompagnants", () => {
  assert.deepEqual(checkBasket({ lines: [], tariffs }), { ok: false, error: "empty" });
  assert.deepEqual(checkBasket({ lines: [{ ticketTypeId: "cat1", quantity: 3 }], tariffs }), { ok: true });
  assert.deepEqual(
    checkBasket({ lines: [{ ticketTypeId: "youth", quantity: 1 }], tariffs }),
    { ok: false, error: "companionRequiresPaid", ticketTypeId: "youth" },
  );
  assert.deepEqual(
    checkBasket({
      lines: [
        { ticketTypeId: "cat2", quantity: 1 },
        { ticketTypeId: "youth", quantity: 2 },
      ],
      tariffs,
    }),
    { ok: true },
  );
  assert.deepEqual(
    checkBasket({
      lines: [
        { ticketTypeId: "cat2", quantity: 1 },
        { ticketTypeId: "youth", quantity: 3 },
      ],
      tariffs,
    }),
    { ok: false, error: "companionLimit", ticketTypeId: "youth" },
  );
  assert.deepEqual(
    checkBasket({ lines: [{ ticketTypeId: "cat1", quantity: 60 }], tariffs }),
    { ok: false, error: "soldOut", ticketTypeId: "cat1" },
  );
});

test("gratuité nominative : seulement avec une place payante", () => {
  const room = (counts: Record<string, number>) => tariffRoom({ ticketTypeId: "youth", counts, tariffs });
  assert.equal(room({}), 0);
  assert.equal(room({ cat2: 1 }), 2);
  assert.equal(room({ cat1: 2, cat2: 1 }), 6);
  assert.equal(room({ cat1: 2, cat2: 1, youth: 6 }), 6);
  assert.equal(tariffRoom({ ticketTypeId: "cat1", counts: {}, tariffs }), 10);
});

test("on ne paie que la hausse nette, jamais de remboursement", () => {
  assert.deepEqual(
    exchangeDue({ givenCents: [6000, 6000], lines: [{ priceCents: 9000, quantity: 2 }] }),
    { newCents: 18000, givenCents: 12000, dueCents: 6000 },
  );
  assert.equal(
    exchangeDue({ givenCents: [9000], lines: [{ priceCents: 6000, quantity: 1 }] }).dueCents,
    0,
  );
  assert.equal(
    exchangeDue({ givenCents: [9000], lines: [{ priceCents: 6000, quantity: 2 }] }).dueCents,
    3000,
  );
});

test("un échange se fait billet pour billet, sans ajout", () => {
  const base = {
    viaAccount: false,
    givenCount: 2,
    newCount: 2,
    givenFree: 0,
    newFree: 0,
    givenCents: 7000,
    newCents: 7000,
  };
  assert.equal(exchangeRuleError(base), null);
  assert.equal(exchangeRuleError({ ...base, newCents: 9000 }), null);
  assert.equal(exchangeRuleError({ ...base, givenCount: 0, givenCents: 0 }), "nothingGiven");
  assert.equal(exchangeRuleError({ ...base, newCount: 1 }), "seatCount");
  // Une différence en sa faveur ne paie pas une place de plus.
  assert.equal(exchangeRuleError({ ...base, givenCount: 1, newCount: 2 }), "seatCount");
});

test("une place gratuite ne se reprend qu'en rendant une place gratuite", () => {
  const base = {
    viaAccount: true,
    givenCount: 2,
    newCount: 2,
    givenFree: 0,
    newFree: 1,
    givenCents: 7000,
    newCents: 3500,
  };
  assert.equal(exchangeRuleError(base), "freeSeats");
  assert.equal(exchangeRuleError({ ...base, givenFree: 1, givenCents: 3500 }), null);
});

test("par le lien, pas de place moins chère ; depuis le compte, sans remboursement", () => {
  const base = {
    viaAccount: false,
    givenCount: 1,
    newCount: 1,
    givenFree: 0,
    newFree: 0,
    givenCents: 8000,
    newCents: 3500,
  };
  assert.equal(exchangeRuleError(base), "lowerValue");
  assert.equal(exchangeRuleError({ ...base, viaAccount: true }), null);
});

test("les bénéficiaires des billets rendus restent sur les nouveaux billets", () => {
  const anna = holderKey("Anna  Muster", "2015-03-02");
  const paul = holderKey("Paul Muster", "2013-07-09");
  assert.equal(holderKey(" anna muster ", "2015-03-02"), anna);
  assert.equal(holdersKept([anna], [anna]), true);
  assert.equal(holdersKept([anna], [paul]), false);
  // Billet rendu non nominatif : le nouveau nom est libre.
  assert.equal(holdersKept([], [paul]), true);
  assert.equal(holdersKept([anna], [paul, anna]), true);
  assert.equal(holdersKept([anna, paul], [anna]), true);
  assert.equal(holdersKept([anna, paul], [anna, anna]), false);
});
