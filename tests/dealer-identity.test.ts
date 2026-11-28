import test from "node:test";
import assert from "node:assert/strict";

import { dealerIdentityError } from "../src/lib/dealerIdentity";

test("a dealer needs a 12-digit FPS number that starts with its 4-digit district code", () => {
  assert.equal(dealerIdentityError("151209500212", "1512", "dealer"), null);
  assert.equal(dealerIdentityError(" 151209500212 ", " 1512 ", "dealer"), null);
  assert.match(dealerIdentityError("15120950021", "1512", "dealer") ?? "", /12 digits/);
  assert.match(dealerIdentityError("151209500212", "151", "dealer") ?? "", /4 digits/);
  assert.match(dealerIdentityError("151309500212", "1512", "dealer") ?? "", /does not start with/);
});

test("admin accounts are not FPS shops and are not checked", () => {
  assert.equal(dealerIdentityError("PRODUCTOWNER", "x", "admin"), null);
});
