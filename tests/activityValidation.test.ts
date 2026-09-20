import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isValidActivityType, suppliedRelationIds } from "@/lib/activityValidation";

describe("isValidActivityType", () => {
  test("accepts every canonical activity type", () => {
    for (const t of ["MEETING", "CALL", "EMAIL", "WHATSAPP", "LINKEDIN", "DEMO", "EVENT_INTERACTION", "REFERRAL", "NOTE", "OTHER"]) {
      assert.equal(isValidActivityType(t), true, `${t} should be valid`);
    }
  });

  test("rejects unsupported or malformed types", () => {
    assert.equal(isValidActivityType("SMOKE_SIGNAL"), false);
    assert.equal(isValidActivityType(""), false);
    assert.equal(isValidActivityType(undefined), false);
    assert.equal(isValidActivityType(null), false);
    assert.equal(isValidActivityType(123), false);
  });
});

describe("suppliedRelationIds", () => {
  test("returns only the relation fields that were actually supplied", () => {
    const result = suppliedRelationIds({ accountId: "acc1", contactId: "", leadId: null, opportunityId: undefined });
    assert.deepEqual(result, [{ field: "accountId", id: "acc1" }]);
  });

  test("returns an empty array when nothing is supplied", () => {
    assert.deepEqual(suppliedRelationIds({}), []);
  });

  test("returns all four when all are supplied", () => {
    const result = suppliedRelationIds({ accountId: "a", contactId: "c", leadId: "l", opportunityId: "o" });
    assert.equal(result.length, 4);
  });
});
