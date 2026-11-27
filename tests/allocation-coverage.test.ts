import test from "node:test";
import assert from "node:assert/strict";

import { noAllocationMonths, type AllocationRecord } from "../src/lib/allocationCoverage";

const recs = (year: string, month: string, ym: string, n: number): AllocationRecord[] =>
  Array.from({ length: n }, (_, i) => ({ year, month, date: `${ym}-${String((i % 28) + 1).padStart(2, "0")} 10:00` }));

const now = { year: "2026", month: "11" };
const plain = (m: Map<string, { year: string; month: string }>) =>
  Object.fromEntries(Array.from(m.entries()).map(([k, v]) => [k, `${v.year}-${v.month}`]));

test("months an earlier allocation was distributed through are marked, pointing at it", () => {
  // April 2026's allocation: 404 in April, 850 in May, 119 in June.
  const records = [
    ...recs("2026", "3", "2026-03", 436),
    ...recs("2026", "4", "2026-04", 404),
    ...recs("2026", "4", "2026-05", 850),
    ...recs("2026", "4", "2026-06", 119),
    ...recs("2026", "7", "2026-07", 432),
  ];
  assert.deepEqual(plain(noAllocationMonths(records, "2026", now)), { "5": "2026-4", "6": "2026-4" });
});

test("a few days of spillover into the next month does not mark it", () => {
  const records = [...recs("2026", "4", "2026-04", 400), ...recs("2026", "4", "2026-05", 30)];
  assert.deepEqual(plain(noAllocationMonths(records, "2026", now)), {});
});

test("a handful of late stragglers months later does not mark the month", () => {
  const records = [...recs("2026", "4", "2026-04", 400), ...recs("2026", "4", "2026-07", 3)];
  assert.deepEqual(plain(noAllocationMonths(records, "2026", now)), {});
});

test("a month with records of its own is never marked", () => {
  const records = [
    ...recs("2026", "4", "2026-04", 400),
    ...recs("2026", "4", "2026-05", 400),
    ...recs("2026", "5", "2026-05", 10),
  ];
  assert.deepEqual(plain(noAllocationMonths(records, "2026", now)), {});
});

test("the current month is never marked — it can still get its own allocation", () => {
  const records = [...recs("2026", "10", "2026-10", 100), ...recs("2026", "10", "2026-11", 300)];
  assert.deepEqual(plain(noAllocationMonths(records, "2026", now)), {});
});

test("an allocation from the previous year can cover January", () => {
  const records = [...recs("2025", "12", "2025-12", 100), ...recs("2025", "12", "2026-01", 300)];
  assert.deepEqual(plain(noAllocationMonths(records, "2026", now)), { "1": "2025-12" });
});

test("a small tail two months later still marks the month (real dealer data)", () => {
  // April allocation: 441 in April, 596 in May, 26 in June (2.4%).
  const records = [
    ...recs("2026", "4", "2026-04", 441),
    ...recs("2026", "4", "2026-05", 596),
    ...recs("2026", "4", "2026-06", 26),
  ];
  assert.deepEqual(plain(noAllocationMonths(records, "2026", now)), { "5": "2026-4", "6": "2026-4" });
});
