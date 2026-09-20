import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isProductKey, PRODUCT_KEYS, BUSINESS_LINES } from "@/lib/products";

describe("product validation", () => {
  test("recognizes every canonical product key", () => {
    for (const key of PRODUCT_KEYS) assert.ok(isProductKey(key));
  });

  test("PlacePulse is a valid business line for the ATM Dubai 2026 leads", () => {
    assert.ok(BUSINESS_LINES.includes("PLACEPULSE"));
  });

  test("SalesX is a canonical product key and a valid business line", () => {
    assert.ok(isProductKey("SALESX"));
    assert.ok(BUSINESS_LINES.includes("SALESX"));
    assert.equal(isProductKey("SalesX"), false, "canonical keys are case-sensitive — the label is SalesX, the key is SALESX");
  });

  test("rejects unknown, empty and null product values", () => {
    assert.equal(isProductKey("NOT_A_PRODUCT"), false);
    assert.equal(isProductKey(""), false);
    assert.equal(isProductKey(null), false);
    assert.equal(isProductKey(undefined), false);
  });

  test("rejects lowercase — product keys are case-sensitive canonical strings", () => {
    assert.equal(isProductKey("placepulse"), false);
  });
});
