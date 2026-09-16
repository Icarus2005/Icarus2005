import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolveLeadSource, resolveUseCase, VALID_SOURCE_TYPES } from "@/lib/leadImport";

describe("resolveLeadSource — sourceType/sourceDetail import", () => {
  test("accepts a known sourceType with no warning", () => {
    const r = resolveLeadSource({ sourceType: "EVENT" }, "Rania Majid");
    assert.equal(r.sourceType, "EVENT");
    assert.equal(r.warning, null);
  });

  test("normalizes case", () => {
    const r = resolveLeadSource({ sourceType: "event" }, "Rania Majid");
    assert.equal(r.sourceType, "EVENT");
  });

  test("falls back to the legacy `source` column when sourceType is absent", () => {
    const r = resolveLeadSource({ source: "REFERRAL" }, "Legacy Lead");
    assert.equal(r.sourceType, "REFERRAL");
    assert.equal(r.warning, null);
  });

  test("prefers sourceType over legacy source when both are present", () => {
    const r = resolveLeadSource({ sourceType: "EVENT", source: "REFERRAL" }, "Lead");
    assert.equal(r.sourceType, "EVENT");
  });

  test("never silently drops an unrecognized sourceType — keeps it and warns", () => {
    const r = resolveLeadSource({ sourceType: "TRADE_SHOW" }, "Someone");
    assert.equal(r.sourceType, "TRADE_SHOW");
    assert.match(r.warning ?? "", /unrecognized sourceType "TRADE_SHOW"/);
  });

  test("empty/absent source resolves to null with no warning", () => {
    const r = resolveLeadSource({}, "Someone");
    assert.equal(r.sourceType, null);
    assert.equal(r.warning, null);
  });

  test("every ArqOne-required source type is recognized", () => {
    for (const t of ["EVENT", "REFERRAL", "INBOUND", "OUTBOUND", "PARTNER", "EXISTING_RELATIONSHIP", "LINKEDIN", "WEBSITE", "OTHER"]) {
      assert.ok(VALID_SOURCE_TYPES.includes(t), `${t} should be a valid source type`);
    }
  });
});

describe("resolveUseCase — extensible use case / context", () => {
  test("accepts a suggested use case with no warning", () => {
    const r = resolveUseCase("AIRPORT_INTELLIGENCE", "Lead X");
    assert.equal(r.useCase, "AIRPORT_INTELLIGENCE");
    assert.equal(r.warning, null);
  });

  test("accepts a custom/unlisted use case — never dropped, just flagged", () => {
    const r = resolveUseCase("Loyalty Program Analytics", "Lead X");
    assert.equal(r.useCase, "LOYALTY PROGRAM ANALYTICS");
    assert.match(r.warning ?? "", /not in the suggested list/);
  });

  test("empty value resolves to null with no warning", () => {
    const r = resolveUseCase(undefined, "Lead X");
    assert.equal(r.useCase, null);
    assert.equal(r.warning, null);
  });
});
