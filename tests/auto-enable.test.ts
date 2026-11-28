import test from "node:test";
import assert from "node:assert/strict";

import { cardsToReEnable, istToMs } from "../src/lib/autoEnable";

test("istToMs reads a transaction's IST local time", () => {
  assert.equal(new Date(istToMs("2026-11-27 14:00")).toISOString(), "2026-11-27T08:30:00.000Z");
  assert.ok(Number.isNaN(istToMs("bad")));
});

test("a disabled card is re-enabled only by a transaction after it was disabled", () => {
  const disabled = [
    { srcNo: "A", disabledAt: "2026-11-27T08:17:39.555Z" }, // disabled 13:47 IST
    { srcNo: "B", disabledAt: "2026-11-27T08:17:39.555Z" },
    { srcNo: "C", disabledAt: null },                        // no disable time: any transaction counts
    { srcNo: "D", disabledAt: "2026-11-27T08:17:39.555Z" },  // no transaction at all
  ];
  const txns = [
    { srcNo: "A", date: "2026-11-27 13:40" }, // before disabling
    { srcNo: "B", date: "2026-11-27 13:40" },
    { srcNo: "B", date: "2026-12-02 10:05" }, // after disabling
    { srcNo: "C", date: "2026-01-01 09:00" },
    { srcNo: "Z", date: "2026-12-02 10:05" }, // not disabled
  ];
  assert.deepEqual(cardsToReEnable(disabled, txns).sort(), ["B", "C"]);
});
