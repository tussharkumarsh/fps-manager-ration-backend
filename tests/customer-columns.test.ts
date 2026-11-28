import test from "node:test";
import assert from "node:assert/strict";

import { CUSTOMER_LIST_COLUMNS } from "../src/lib/beneficiaryMerge";

test("the customer list leaves out family members but keeps every other column", () => {
  const cols = CUSTOMER_LIST_COLUMNS.split(",");
  assert.equal(cols.includes("members_json"), false);
  for (const c of [
    "fps_id", "src_no", "name", "scheme", "member_count", "mobile", "disabled", "disabled_reason",
    "source_fps_id", "portal_synced_at", "approval_date", "approved_by", "status_code", "portal_mobile",
  ]) assert.ok(cols.includes(c), c);
});
