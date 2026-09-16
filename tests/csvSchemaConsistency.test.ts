import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { IMPORT_COLUMNS } from "@/lib/importSchemas";
import { LEAD_SOURCE_TYPES, USE_CASES } from "@/lib/constants";

describe("CSV import schema consistency", () => {
  test("Lead import supports every field the ATM sales-ops workflow needs", () => {
    const required = [
      "primaryProduct",
      "secondaryProducts",
      "sourceType",
      "sourceDetail",
      "useCase",
      "status",
      "score",
      "estimatedValue",
      "ownerEmail",
      "notes",
    ];
    for (const col of required) {
      assert.ok((IMPORT_COLUMNS.leads as readonly string[]).includes(col), `leads import should support "${col}"`);
    }
  });

  test("Opportunity import supports useCase alongside the existing fields", () => {
    assert.ok((IMPORT_COLUMNS.opportunities as readonly string[]).includes("useCase"));
    assert.ok((IMPORT_COLUMNS.opportunities as readonly string[]).includes("product"));
    assert.ok((IMPORT_COLUMNS.opportunities as readonly string[]).includes("accountName"));
  });

  test("Contact import still requires accountName for its dedup/linking flow", () => {
    assert.ok((IMPORT_COLUMNS.contacts as readonly string[]).includes("accountName"));
    assert.ok((IMPORT_COLUMNS.contacts as readonly string[]).includes("email"));
  });

  test("Account import is untouched by this change (no product-specific columns added)", () => {
    assert.deepEqual(
      [...IMPORT_COLUMNS.accounts],
      ["name", "country", "sector", "industry", "size", "tier", "ownerEmail", "website", "description"]
    );
  });

  test("every sourceType suggested in LEAD_SOURCE_TYPES is a plain uppercase key (import normalizes to match)", () => {
    for (const key of Object.keys(LEAD_SOURCE_TYPES)) {
      assert.equal(key, key.toUpperCase());
    }
  });

  test("every useCase suggestion is a plain uppercase key (import normalizes to match)", () => {
    for (const key of Object.keys(USE_CASES)) {
      assert.equal(key, key.toUpperCase());
    }
  });
});
