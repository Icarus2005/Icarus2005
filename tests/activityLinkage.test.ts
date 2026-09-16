import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { activityProductWhere, taskProductWhere } from "@/lib/filters";
import { ACTIVITY_TYPES } from "@/lib/constants";
import { inheritedProduct } from "@/lib/products";

describe("Activity — canonical interaction history", () => {
  test("supports every required interaction type", () => {
    for (const t of ["MEETING", "CALL", "EMAIL", "WHATSAPP", "LINKEDIN", "DEMO", "EVENT_INTERACTION", "NOTE", "OTHER"]) {
      assert.ok(t in ACTIVITY_TYPES, `${t} should be a recognized Activity type`);
    }
  });

  test("product filtering inherits from opportunity, then lead, then the activity's own product field", () => {
    const where = activityProductWhere("PLACEPULSE");
    assert.deepEqual(where, {
      OR: [
        { opportunity: { product: "PLACEPULSE" } },
        { opportunityId: null, lead: { primaryProduct: "PLACEPULSE" } },
        { opportunityId: null, leadId: null, product: "PLACEPULSE" },
      ],
    });
  });

  test("no filter is applied when product is empty (activities linked to Account/Contact/Lead/Opportunity are all visible)", () => {
    assert.deepEqual(activityProductWhere(""), {});
  });
});

describe("Task — future commitment, same inheritance rule as Activity", () => {
  test("product filtering matches Activity's inheritance rule", () => {
    assert.deepEqual(taskProductWhere("PLYMIO"), activityProductWhere("PLYMIO"));
  });
});

describe("inheritedProduct — one rule shared by Activity and Task", () => {
  test("opportunity product wins over lead and own product", () => {
    assert.equal(
      inheritedProduct({ product: "ADVISORY", opportunity: { product: "PLACEPULSE" }, lead: { primaryProduct: "PLYMIO" } }),
      "PLACEPULSE"
    );
  });

  test("falls back to lead primary product when there is no opportunity", () => {
    assert.equal(inheritedProduct({ product: "ADVISORY", opportunity: null, lead: { primaryProduct: "PLYMIO" } }), "PLYMIO");
  });

  test("falls back to the record's own product when linked only to account/contact", () => {
    assert.equal(inheritedProduct({ product: "AI_NAVIGATOR", opportunity: null, lead: null }), "AI_NAVIGATOR");
  });

  test("defaults to UNASSIGNED with no context at all", () => {
    assert.equal(inheritedProduct({}), "UNASSIGNED");
  });
});
