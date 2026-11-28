import test from "node:test";
import assert from "node:assert/strict";

import { dealersToSync, fanOutBase, isCronAuthorized, monthsToSync, retryOnce } from "../src/lib/nightlySync";

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

test("fanOutBase prefers the production domain (deployment URLs sit behind Vercel Authentication)", () => {
  assert.equal(
    fanOutBase({ VERCEL_PROJECT_PRODUCTION_URL: "fps-manager-ration-backend.vercel.app" }, "fps-x-abc123.vercel.app"),
    "https://fps-manager-ration-backend.vercel.app"
  );
  assert.equal(fanOutBase({}, "localhost:4000"), "https://localhost:4000");
});

test("retryOnce waits and runs a failed job one more time", async () => {
  const waits: number[] = [];
  const sleep = async (ms: number) => { waits.push(ms); };
  let calls = 0;
  const flaky = async () => { calls++; if (calls === 1) throw new Error("fetch failed"); return "ok"; };
  assert.equal(await retryOnce(flaky, 15_000, sleep), "ok");
  assert.equal(calls, 2);
  assert.deepEqual(waits, [15_000]);

  let failing = 0;
  await assert.rejects(retryOnce(async () => { failing++; throw new Error("down"); }, 10, sleep), /down/);
  assert.equal(failing, 2);
});
