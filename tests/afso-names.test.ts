import test from "node:test";
import assert from "node:assert/strict";

import { afsoNamesFor } from "../src/lib/scmAllotment";

test("afsoNamesFor uses the known table, then the portal directory, then blanks", () => {
  assert.deepEqual(afsoNamesFor("1512095", []), { distName: "Hingoli", afsoName: "HINGOLI" });
  assert.deepEqual(
    afsoNamesFor("1512093", [{ officeCode: "1512093", distName: "Hingoli", afsoName: "BASMATH" }]),
    { distName: "Hingoli", afsoName: "BASMATH" }
  );
  assert.deepEqual(afsoNamesFor("1999999", [{ officeCode: "1512093", distName: "Hingoli", afsoName: "BASMATH" }]), { distName: "", afsoName: "" });
});
