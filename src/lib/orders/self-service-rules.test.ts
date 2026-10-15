import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cancelOpen,
  changeOpen,
  checkBasket,
  exchangeDue,
  linkLimitError,
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

test("par le lien, un échange ne fait pas perdre de places ni de valeur", () => {
  const base = { viaAccount: false, givenCount: 2, newCount: 2, givenCents: 5000, newCents: 5000 };
  assert.equal(linkLimitError(base), null);
  assert.equal(linkLimitError({ ...base, newCount: 3, newCents: 6000 }), null);
  assert.equal(linkLimitError({ ...base, newCount: 1, newCents: 6000 }), "fewerSeats");
  assert.equal(linkLimitError({ ...base, newCents: 4000 }), "lowerValue");
  assert.equal(linkLimitError({ ...base, givenCount: 0, givenCents: 0, newCount: 1, newCents: 0 }), null);
});

test("depuis le compte, le client peut échanger à la baisse", () => {
  assert.equal(
    linkLimitError({ viaAccount: true, givenCount: 4, newCount: 1, givenCents: 20000, newCents: 1000 }),
    null,
  );
});
