import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { planContactImport } from "@/lib/contactImport";

const accountMap = new Map([["emaar malls", "acc_1"]]);

describe("planContactImport — duplicate email handling", () => {
  test("creates a contact with no conflicting email", () => {
    const plan = planContactImport(
      [{ firstName: "Layla", lastName: "Haddad", accountName: "Emaar Malls", email: "layla@emaarmalls.com" }],
      accountMap,
      new Map()
    );
    assert.equal(plan.length, 1);
    assert.equal(plan[0].outcome, "create");
  });

  test("skips a row whose email already belongs to an existing contact, and names it", () => {
    const existing = new Map([["layla@emaarmalls.com", { id: "c_1", firstName: "Layla", lastName: "Haddad" }]]);
    const plan = planContactImport(
      [{ firstName: "Layla", lastName: "H.", accountName: "Emaar Malls", email: "Layla@EmaarMalls.com" }],
      accountMap,
      existing
    );
    assert.equal(plan[0].outcome, "duplicate");
    assert.match((plan[0] as { message: string }).message, /already belongs to Layla Haddad \(id c_1\)/);
  });

  test("does not create a duplicate person — two rows in the same file share an email", () => {
    const plan = planContactImport(
      [
        { firstName: "Omar", lastName: "Nasser", accountName: "Emaar Malls", email: "omar@maf.ae" },
        { firstName: "Omar", lastName: "N.", accountName: "Emaar Malls", email: "omar@maf.ae" },
      ],
      accountMap,
      new Map()
    );
    assert.equal(plan[0].outcome, "create");
    assert.equal(plan[1].outcome, "duplicate");
    assert.match((plan[1] as { message: string }).message, /duplicated within this file/);
  });

  test("rows without an email cannot be deduplicated and are always created", () => {
    const plan = planContactImport(
      [
        { firstName: "A", lastName: "B", accountName: "Emaar Malls", email: "" },
        { firstName: "A", lastName: "B", accountName: "Emaar Malls", email: "" },
      ],
      accountMap,
      new Map()
    );
    assert.equal(plan[0].outcome, "create");
    assert.equal(plan[1].outcome, "create");
  });

  test("never silently drops a row — missing account is a reported error, not a silent skip", () => {
    const plan = planContactImport(
      [{ firstName: "A", lastName: "B", accountName: "Nonexistent Co", email: "" }],
      accountMap,
      new Map()
    );
    assert.equal(plan[0].outcome, "error");
    assert.match((plan[0] as { message: string }).message, /not found/);
  });

  test("missing firstName/lastName is reported, not silently skipped", () => {
    const plan = planContactImport([{ firstName: "", lastName: "", accountName: "Emaar Malls" }], accountMap, new Map());
    assert.equal(plan[0].outcome, "error");
  });
});
