import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { detectHeaderMismatch, IMPORT_COLUMNS } from "@/lib/importSchemas";

describe("detectHeaderMismatch — blocks a CSV uploaded into the wrong importer", () => {
  test("a Contacts CSV uploaded into the Accounts tab is blocked with a clear message", () => {
    const msg = detectHeaderMismatch("accounts", [...IMPORT_COLUMNS.contacts]);
    assert.ok(msg);
    assert.match(msg!, /appears to be a Contacts CSV/);
  });

  test("a Leads CSV uploaded into the Accounts tab is blocked, even though both share a 'name' column", () => {
    const msg = detectHeaderMismatch("accounts", [...IMPORT_COLUMNS.leads]);
    assert.ok(msg);
    assert.match(msg!, /appears to be a Leads CSV/);
  });

  test("an Accounts CSV uploaded into the Contacts tab is blocked (and reads grammatically: 'an Accounts CSV')", () => {
    const msg = detectHeaderMismatch("contacts", [...IMPORT_COLUMNS.accounts]);
    assert.equal(msg, "This appears to be an Accounts CSV. Switch to Accounts to import it.");
  });

  test("an Opportunities CSV uploaded into the Leads tab is blocked", () => {
    const msg = detectHeaderMismatch("leads", [...IMPORT_COLUMNS.opportunities]);
    assert.ok(msg);
    assert.match(msg!, /appears to be an Opportunities CSV/);
  });

  test("a Contacts CSV uploaded into the Opportunities tab is blocked (shared accountName column doesn't confuse the detector)", () => {
    const msg = detectHeaderMismatch("opportunities", [...IMPORT_COLUMNS.contacts]);
    assert.ok(msg);
    assert.match(msg!, /appears to be a Contacts CSV/);
  });

  test("each entity's own correct template passes with no message", () => {
    for (const entity of Object.keys(IMPORT_COLUMNS) as (keyof typeof IMPORT_COLUMNS)[]) {
      const msg = detectHeaderMismatch(entity, [...IMPORT_COLUMNS[entity]]);
      assert.equal(msg, null, `${entity}'s own template should never be blocked, got: ${msg}`);
    }
  });

  test("a genuinely empty/garbage header set is blocked as missing required columns, not misattributed to another entity", () => {
    const msg = detectHeaderMismatch("accounts", ["foo", "bar"]);
    assert.ok(msg);
    assert.match(msg!, /Missing required column/);
  });

  test("Leads CSV missing its 'name' column is still blocked even when otherwise well-formed", () => {
    const headers = (IMPORT_COLUMNS.leads as readonly string[]).filter((c) => c !== "name");
    const msg = detectHeaderMismatch("leads", headers);
    assert.ok(msg);
    assert.match(msg!, /Missing required column/);
  });

  test("Opportunities CSV missing accountName is blocked", () => {
    const headers = (IMPORT_COLUMNS.opportunities as readonly string[]).filter((c) => c !== "accountName");
    const msg = detectHeaderMismatch("opportunities", headers);
    assert.ok(msg);
    assert.match(msg!, /Missing required column/);
  });
});
