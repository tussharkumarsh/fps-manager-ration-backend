import test from "node:test";
import assert from "node:assert/strict";

import { pickNewer, sanitizeProfile, type ShopProfile } from "../src/lib/shopProfile";

const zero = { rcs: 0, m1anarc: 0, units: 0, anam: 0 };
const profile = (over: Partial<ShopProfile> = {}): ShopProfile => ({
  shopFpsId: "151209500218", officeCode: "1512095", dealerName: "guruprasad", mobile: "9922695172",
  shopNo: "", village: "Hingoli", tehsil: "Hingoli", licenseNo: "6/93", shopType: "M",
  district: "Hingoli", dfso: "", tfso: "TAHSIL OFFICE HINGOLI",
  reportUpdatedOn: "20/11/2026 03:22:48 AM", reportUpdatedAt: "2026-11-19T21:52:48.000Z",
  counts: { na: zero, aay: { rcs: 79, m1anarc: 79, units: 350, anam: 350 }, phh: zero, total: zero },
  uploadedAt: "2026-11-28T06:00:00.000Z",
  ...over,
});

test("pickNewer keeps the later report", () => {
  const existing = profile();
  const older = profile({ reportUpdatedAt: "2026-10-01T00:00:00.000Z", mobile: "1111111111" });
  assert.equal(pickNewer(existing, older), existing);
  assert.equal(pickNewer(older, existing), existing);
  assert.equal(pickNewer(undefined, older), older);
});

test("pickNewer gives ties to the incoming report", () => {
  const a = profile({ mobile: "1" });
  const b = profile({ mobile: "2" });
  assert.equal(pickNewer(a, b), b);
});

test("sanitizeProfile drops a bad id and fills missing counts with 0", () => {
  assert.equal(sanitizeProfile({ shopFpsId: "abc" }), null);
  assert.equal(sanitizeProfile({ shopFpsId: "151209500218" }), null); // no report time
  const p = sanitizeProfile({
    shopFpsId: " 151209500218 ", reportUpdatedAt: "2026-11-19T21:52:48.000Z", mobile: "x".repeat(50),
    counts: { aay: { rcs: "79", units: "oops" } }, evil: "drop",
  });
  assert.ok(p);
  assert.equal(p.shopFpsId, "151209500218");
  assert.equal(p.mobile.length, 20);
  assert.deepEqual(p.counts.aay, { rcs: 79, m1anarc: 0, units: 0, anam: 0 });
  assert.deepEqual(p.counts.total, zero);
  assert.equal("evil" in p, false);
});
