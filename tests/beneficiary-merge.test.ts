import test from "node:test";
import assert from "node:assert/strict";

import { countMissing, isFullMobile, mergeBeneficiary, type CustomerRow } from "../src/lib/beneficiaryMerge";
import type { Customer } from "../src/types";

const AT = "2026-11-28T10:00:00.000Z";

const row = (over: Partial<CustomerRow> = {}): CustomerRow => ({
  fps_id: "151209500212",
  src_no: "272004810775",
  name: "OLD NAME",
  last_dispatched: null,
  scheme: "PHH",
  s_no: null,
  area_type: "Rural",
  status: null,
  member_count: null,
  mobile: null,
  family_head: null,
  members_json: null,
  disabled: false,
  disabled_reason: null,
  disabled_at: null,
  source_fps_id: null,
  source_fps_name: null,
  portal_synced_at: null,
  approval_date: null,
  approved_by: null,
  status_code: null,
  portal_mobile: null,
  ...over,
});

const card = (over: Partial<Customer> = {}): Customer => ({
  srcNo: "272004810775",
  name: "SHANTIRAM NARAYAN PRADHAN",
  scheme: "AAY",
  sNo: 1,
  status: "Verified and Approved",
  statusCode: "A",
  approvalDate: "31/08/2024 16:11:28",
  approvedBy: "N/A",
  memberCount: 1,
  members: [{ msNo: 1, nameEng: "SHANTIRAM NARAYAN PRADHAN" }],
  sourceFpsId: "151209500212",
  sourceFpsName: "SHRIDHAR JAGDISH BAmb",
  portalMobile: "XXXXX X8643",
  ...over,
});

test("isFullMobile accepts exactly 10 digits", () => {
  assert.equal(isFullMobile("9876543210"), true);
  assert.equal(isFullMobile(" 98765 43210 "), true);
  assert.equal(isFullMobile("XXXXX X8643"), false);
  assert.equal(isFullMobile("-"), false);
  assert.equal(isFullMobile(""), false);
  assert.equal(isFullMobile(null), false);
});

test("new card takes file data; mobile only when full", () => {
  const masked = mergeBeneficiary("151209500212", undefined, card(), AT);
  assert.equal(masked.mobile, null);
  assert.equal(masked.portal_mobile, "XXXXX X8643");
  assert.equal(masked.portal_synced_at, AT);
  assert.equal(masked.scheme, "AAY");
  assert.equal(masked.source_fps_id, "151209500212");
  assert.equal(masked.approval_date, "31/08/2024 16:11:28");
  assert.equal(masked.status_code, "A");

  const full = mergeBeneficiary("151209500212", undefined, card({ portalMobile: "9876543210" }), AT);
  assert.equal(full.mobile, "9876543210");
});

test("existing real mobile and disable survive", () => {
  const existing = row({
    mobile: "9876543210", disabled: true, disabled_reason: "moved",
    disabled_at: "2026-10-01T00:00:00Z", last_dispatched: "Oct",
  });
  const out = mergeBeneficiary("151209500212", existing, card({ name: "NEW NAME" }), AT);
  assert.equal(out.mobile, "9876543210");
  assert.equal(out.last_dispatched, "Oct");
  assert.equal(out.name, "NEW NAME");
  assert.equal("disabled" in out, false);
  assert.equal("disabled_reason" in out, false);
  assert.equal("disabled_at" in out, false);
});

test("an empty dealer mobile is filled from a full file mobile", () => {
  const out = mergeBeneficiary("151209500212", row({ mobile: null }), card({ portalMobile: "9876543210" }), AT);
  assert.equal(out.mobile, "9876543210");
});

test("file fields overwrite, blanks do not", () => {
  const existing = row({ status: "Yet to be Scanned", area_type: "Urban" });
  const out = mergeBeneficiary("151209500212", existing, card({ areaType: "" }), AT);
  assert.equal(out.status, "Verified and Approved");
  assert.equal(out.area_type, "Urban");
});

test("merge is idempotent", () => {
  const once = mergeBeneficiary("151209500212", row(), card(), AT);
  const twice = mergeBeneficiary("151209500212", { ...row(), ...once }, card(), AT);
  assert.deepEqual(twice, once);
});

test("source FPS is replaced by the latest file", () => {
  const out = mergeBeneficiary(
    "151209500212", row({ source_fps_id: null }),
    card({ sourceFpsId: "151209500199", sourceFpsName: "DHANAJI" }), AT
  );
  assert.equal(out.source_fps_id, "151209500199");
  assert.equal(out.source_fps_name, "DHANAJI");
});

test("countMissing counts only same-source cards not touched by this upload", () => {
  const rows = [
    row({ src_no: "1", source_fps_id: "151209500212", portal_synced_at: AT }), // in this upload
    row({ src_no: "2", source_fps_id: "151209500212", portal_synced_at: "2026-11-01T00:00:00Z" }), // older upload
    row({ src_no: "3", source_fps_id: null, portal_synced_at: null }), // imported before sources existed: own card
    row({ src_no: "4", source_fps_id: "151209500199", portal_synced_at: "2026-11-01T00:00:00Z" }), // other source
  ];
  // Own FPS upload: an own card with no source yet counts as missing too.
  assert.equal(countMissing(rows, "151209500212", AT, "151209500212"), 2);
  // Another FPS upload: only that FPS cards.
  assert.equal(countMissing(rows, "151209500199", AT, "151209500212"), 1);
});

test("countMissing compares times, not timestamp text", () => {
  // Postgres returns timestamptz as "+00:00", the upload stamp is "...Z".
  const rows = [row({ src_no: "1", source_fps_id: "151209500199", portal_synced_at: "2026-11-28T10:00:00+00:00" })];
  assert.equal(countMissing(rows, "151209500199", AT, "151209500212"), 0);
});
