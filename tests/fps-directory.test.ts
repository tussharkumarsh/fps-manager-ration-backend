import test from "node:test";
import assert from "node:assert/strict";

import { isValidOfficeCode, officeCodeOf, parseAfsoOwners } from "../src/lib/fpsDirectory";

test("parses the portal's AFSO owner list", () => {
  const rows = parseAfsoOwners(
    [
      {
        fpsId: "151209500218", ownerNameEn: "Prakash Vithoba Rajguru", terminalId: "2305872570", terminal: "2570",
        longitude: 77.15078, latitude: 19.726824, distNameEn: "Hingoli", afsoNameEn: "HINGOLI",
        mobileNo: "XXXXX-X6940", totalCards: 398,
      },
      // A shop with no owner mapped yet.
      { fpsId: "151209500067", ownerNameEn: null, terminalId: "NA", longitude: "NA", latitude: "NA", mobileNo: "NA", totalCards: 0 },
      { fpsId: "bad" },
      null,
    ],
    "1512095",
    "2026-11-27T00:00:00.000Z"
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    shopFpsId: "151209500218", officeCode: "1512095", ownerName: "Prakash Vithoba Rajguru", terminalId: "2305872570",
    mobileMasked: "XXXXX-X6940", distName: "Hingoli", afsoName: "HINGOLI", totalCards: 398,
    longitude: 77.15078, latitude: 19.726824, fetchedAt: "2026-11-27T00:00:00.000Z",
  });
  assert.equal(rows[1].ownerName, "");
  assert.equal(rows[1].terminalId, "");
  assert.equal(rows[1].mobileMasked, "");
  assert.equal(rows[1].longitude, null);
});

test("a non-list response is a format change, not an empty office", () => {
  assert.throws(() => parseAfsoOwners({ error: "x" }, "1512095"), /not a list/);
});

test("office codes are the first 7 digits of an FPS number", () => {
  assert.equal(officeCodeOf("151209300100"), "1512093");
  assert.equal(isValidOfficeCode("1512095"), true);
  assert.equal(isValidOfficeCode("151209"), false);
  assert.equal(isValidOfficeCode("15120955"), false);
});
