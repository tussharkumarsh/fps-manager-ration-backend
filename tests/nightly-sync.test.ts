import test from "node:test";
import assert from "node:assert/strict";

import { dealersToSync, isCronAuthorized, monthsToSync } from "../src/lib/nightlySync";

test("monthsToSync is the current IST month, plus the previous one in the first five days", () => {
  // 28 Nov 2026 23:00 IST
  assert.deepEqual(monthsToSync(new Date("2026-11-28T17:30:00Z")), [{ year: "2026", month: "11" }]);
  // 3 Dec 2026 23:00 IST: November's allocation is still being distributed
  assert.deepEqual(monthsToSync(new Date("2026-12-03T17:30:00Z")), [
    { year: "2026", month: "12" },
    { year: "2026", month: "11" },
  ]);
  // 1 Jan 2027 00:30 IST (still 31 Dec in UTC): the year rolls back too
  assert.deepEqual(monthsToSync(new Date("2026-12-31T19:00:00Z")), [
    { year: "2027", month: "1" },
    { year: "2026", month: "12" },
  ]);
});

test("isCronAuthorized needs the exact bearer secret, and a configured one", () => {
  assert.equal(isCronAuthorized("Bearer s3cret", "s3cret"), true);
  assert.equal(isCronAuthorized("Bearer wrong", "s3cret"), false);
  assert.equal(isCronAuthorized(undefined, "s3cret"), false);
  assert.equal(isCronAuthorized("Bearer ", ""), false);
  assert.equal(isCronAuthorized("Bearer x", undefined), false);
});

test("dealersToSync keeps active dealers with an FPS and district", () => {
  const users = [
    { fpsId: "151209500212", distCode: "1512", role: "dealer", active: true },
    { fpsId: "151209500228", distCode: "1512", role: "dealer", active: false },
    { fpsId: "PRODUCTOWNER", distCode: "0000", role: "admin", active: true },
    { fpsId: "151209500299", distCode: "", role: "dealer", active: true },
  ];
  assert.deepEqual(dealersToSync(users).map((u) => u.fpsId), ["151209500212"]);
});
