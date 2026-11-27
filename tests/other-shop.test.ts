import test from "node:test";
import assert from "node:assert/strict";

import { isValidShopFpsId, sanitizeShopDetails } from "../src/lib/otherShop";

test("shop FPS ids must be digits", () => {
  assert.equal(isValidShopFpsId("151209500218"), true);
  assert.equal(isValidShopFpsId(" 151209500218 "), true);
  assert.equal(isValidShopFpsId("Self"), false);
  assert.equal(isValidShopFpsId(""), false);
  assert.equal(isValidShopFpsId(151209500218), false);
});

test("shop details are trimmed, capped and limited to known fields", () => {
  const d = sanitizeShopDetails({
    shopName: "  Ram Ration  ",
    mobile: 9876543210,
    notes: "x".repeat(2000),
    evil: "drop me",
    address: null,
  });
  assert.equal(d.shopName, "Ram Ration");
  assert.equal(d.mobile, "9876543210");
  assert.equal(d.notes.length, 1000);
  assert.equal(d.address, "");
  assert.equal(d.dealerName, "");
  assert.ok(!("evil" in d));
});
