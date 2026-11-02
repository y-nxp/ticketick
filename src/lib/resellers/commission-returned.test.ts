import assert from "node:assert/strict";
import { test } from "node:test";
import { commissionReturned } from "./commission";

test("pourcentage : au prorata du montant des billets retirés", () => {
  // Vente de 3 × 50 + 1 × 30 = 180 CHF à 10 % → 18 CHF ; on retire le billet à 30.
  assert.equal(
    commissionReturned("PERCENT", 1800, { amountCents: 18000, paidTickets: 4 }, { amountCents: 3000, paidTickets: 1 }),
    300,
  );
});

test("montant fixe : au prorata des billets payants", () => {
  assert.equal(
    commissionReturned("FIXED_PER_TICKET", 800, { amountCents: 18000, paidTickets: 4 }, { amountCents: 3000, paidTickets: 1 }),
    200,
  );
});

test("retraits successifs : le dernier reprend exactement le reste", () => {
  let remaining = 1000; // 3 billets à 33.33 % chacun
  const first = commissionReturned("PERCENT", remaining, { amountCents: 9000, paidTickets: 3 }, { amountCents: 3000, paidTickets: 1 });
  remaining -= first;
  const second = commissionReturned("PERCENT", remaining, { amountCents: 6000, paidTickets: 2 }, { amountCents: 6000, paidTickets: 2 });
  assert.equal(first + second, 1000);
});

test("billet gratuit retiré ou commission nulle : rien à reprendre", () => {
  assert.equal(commissionReturned("FIXED_PER_TICKET", 500, { amountCents: 5000, paidTickets: 1 }, { amountCents: 0, paidTickets: 0 }), 0);
  assert.equal(commissionReturned("PERCENT", 0, { amountCents: 5000, paidTickets: 1 }, { amountCents: 5000, paidTickets: 1 }), 0);
});
