import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { derivePrimaryContact } from "@/lib/opportunityContacts";

describe("derivePrimaryContact — OpportunityContact.isPrimary is the sole source of truth", () => {
  test("returns the contact flagged isPrimary", () => {
    const primary = derivePrimaryContact([
      { id: "c1", isPrimary: false },
      { id: "c2", isPrimary: true },
    ]);
    assert.equal(primary?.id, "c2");
  });

  test("returns null when no contact is flagged primary", () => {
    const primary = derivePrimaryContact([{ id: "c1", isPrimary: false }]);
    assert.equal(primary, null);
  });

  test("returns null for an opportunity with no stakeholders", () => {
    assert.equal(derivePrimaryContact([]), null);
  });
});
