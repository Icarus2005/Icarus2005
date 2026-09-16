import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { leadSourceWhere } from "@/lib/filters";

describe("leadSourceWhere — ATM-style event source reporting", () => {
  test("builds a where clause for 'leads from ATM Dubai 2026'", () => {
    const where = leadSourceWhere("EVENT", "ATM Dubai 2026");
    assert.deepEqual(where, {
      AND: [{ sourceType: "EVENT" }, { sourceDetail: { contains: "ATM Dubai 2026", mode: "insensitive" } }],
    });
  });

  test("sourceDetail match is case-insensitive so CSV-imported casing doesn't matter", () => {
    const where = leadSourceWhere("", "atm dubai 2026");
    assert.deepEqual(where, { AND: [{ sourceDetail: { contains: "atm dubai 2026", mode: "insensitive" } }] });
  });

  test("returns an empty clause (matches everything) when nothing is specified", () => {
    assert.deepEqual(leadSourceWhere("", ""), {});
  });

  test("sourceType alone filters by provenance without requiring a detail string", () => {
    assert.deepEqual(leadSourceWhere("REFERRAL", ""), { AND: [{ sourceType: "REFERRAL" }] });
  });
});
