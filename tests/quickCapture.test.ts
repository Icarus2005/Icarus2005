import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDueDate, sanitizeSuggestion } from "../src/lib/capture/quick";
import { extractCaptureContext } from "../src/lib/capture/extract";

const monday = new Date("2026-09-28T12:00:00Z");

test("LiveX debrief: dates use the next named Dubai weekday", () => {
  assert.equal(resolveDueDate("Follow up Tuesday", monday), "2026-09-29");
  assert.equal(resolveDueDate("follow up Wednesday", monday), "2026-09-30");
  assert.equal(resolveDueDate("Follow up next week", monday), "2026-10-05");
  assert.equal(resolveDueDate("No date agreed", monday), null);
});

test("unknown person stays unknown, while company and product remain review suggestions", () => {
  const transcript = "I met someone from ABC. I didn't get his name. Interesting conversation about SalesX. Need to find him on LinkedIn later.";
  const suggestion = sanitizeSuggestion({ personName: "Alex", companyName: "ABC", productKey: "SALESX", nextAction: "Identify contact on LinkedIn", evidenceByField: { personName: "someone", companyName: "ABC" } }, transcript, monday);
  assert.equal(suggestion.personName, null);
  assert.equal(suggestion.companyName, "ABC");
  assert.equal(suggestion.productKey, "SALESX");
  assert.equal(suggestion.dueDate, null);
});

test("invented surname and formal role are discarded before review", () => {
  const transcript = "I met Ahmed from Example Group. He works in partnerships. We discussed PlacePulse.";
  const suggestion = sanitizeSuggestion({ personName: "Ahmed Ali", companyName: "Example Group", statedRole: "Director of Partnerships", productKey: "PLACEPULSE", evidenceByField: { personName: "Ahmed", companyName: "Example Group", statedRole: "works in partnerships" } }, transcript, monday);
  assert.equal(suggestion.personName, null);
  assert.equal(suggestion.statedRole, null);
  assert.equal(suggestion.companyName, "Example Group");
  assert.equal(suggestion.productKey, "PLACEPULSE");
});

test("provider extraction requests constrained JSON and grounds the returned name", async () => {
  const previousFetch = global.fetch;
  const previousKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-key";
  global.fetch = async (_url, options) => {
    const payload = JSON.parse(String(options?.body));
    assert.equal(payload.output_config.format.type, "json_schema");
    assert.equal(payload.output_config.format.schema.additionalProperties, false);
    assert.equal(payload.model, "claude-haiku-4-5-20251001");
    return new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ personName: "Alex", companyName: "ABC", statedRole: null, productKey: "SALESX", conversationSummary: "Discussed SalesX.", relationshipContext: null, theirCommitment: null, myCommitment: null, nextAction: "Find contact", dueDate: null, notes: null, evidenceByField: { personName: "someone", companyName: "ABC", statedRole: "", productKey: "SalesX", theirCommitment: "", myCommitment: "", nextAction: "find him", dueDate: "" } }) }] }), { status: 200 });
  };
  try {
    const result = await extractCaptureContext("I met someone from ABC about SalesX. Need to find him.", monday);
    assert.equal(result?.personName, null);
    assert.equal(result?.companyName, "ABC");
    assert.equal(result?.productKey, "SALESX");
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
  }
});
