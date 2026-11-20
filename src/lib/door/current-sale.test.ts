import { test } from "node:test";
import assert from "node:assert/strict";
import { currentSaleSession } from "./current-sale";

test("the till stays on a concert until two hours after it starts, then moves on", () => {
  const sessions = [
    { id: "15h", startsAt: new Date("2026-12-29T14:00:00Z") },
    { id: "19h", startsAt: new Date("2026-12-29T18:00:00Z") },
  ];
  assert.equal(currentSaleSession(sessions, new Date("2026-12-29T10:00:00Z"))?.id, "15h");
  assert.equal(currentSaleSession(sessions, new Date("2026-12-29T15:59:00Z"))?.id, "15h");
  assert.equal(currentSaleSession(sessions, new Date("2026-12-29T16:00:01Z"))?.id, "19h");
  assert.equal(currentSaleSession(sessions, new Date("2026-12-29T20:00:01Z")), null);
});
