import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDueDate, sanitizeSuggestion } from "../src/lib/capture/quick";
import { extractCaptureContext, QUICK_CAPTURE_MODEL } from "../src/lib/capture/extract";

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

test("OpenAI extraction uses strict Responses JSON and grounds an unknown person", async () => {
  const previousFetch = global.fetch;
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  global.fetch = async (url, options) => {
    const payload = JSON.parse(String(options?.body));
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal((options?.headers as Record<string, string>).authorization, "Bearer test-key");
    assert.equal(payload.text.format.type, "json_schema");
    assert.equal(payload.text.format.strict, true);
    assert.equal(payload.text.format.schema.additionalProperties, false);
    assert.equal(payload.model, QUICK_CAPTURE_MODEL);
    assert.equal(payload.store, false);
    return new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ personName: "Alex", companyName: "ABC", statedRole: null, productKey: "SALESX", conversationSummary: "Discussed SalesX.", relationshipContext: null, theirCommitment: null, myCommitment: null, nextAction: "Identify contact on LinkedIn", dueDate: null, notes: null, evidenceByField: { personName: "someone", companyName: "ABC", statedRole: "", productKey: "SalesX", theirCommitment: "", myCommitment: "", nextAction: "LinkedIn", dueDate: "" } }) }] }] }), { status: 200 });
  };
  try {
    const result = await extractCaptureContext("I met someone from ABC. I didn't get his name. Interesting conversation about SalesX. Need to identify him on LinkedIn later.", monday);
    assert.equal(result?.personName, null);
    assert.equal(result?.companyName, "ABC");
    assert.equal(result?.productKey, "SALESX");
    assert.match(result?.nextAction ?? "", /LinkedIn/);
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("OpenAI extraction preserves conditional introduction and resolves Tuesday", async () => {
  const previousFetch = global.fetch;
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  global.fetch = async () => new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ personName: "Sarah Ahmed", companyName: "Company X", statedRole: "innovation", productKey: "PLACEPULSE", conversationSummary: "Sarah Ahmed discussed PlacePulse for destination retail and requested the retail deck.", relationshipContext: null, theirCommitment: "May introduce me to their strategy director", myCommitment: "Send retail deck", nextAction: "Send retail deck and follow up", dueDate: "2026-09-29", notes: "Previously worked at Galleria Mall.", evidenceByField: { personName: "Sarah Ahmed", companyName: "Company X", statedRole: "works in innovation", productKey: "PlacePulse", theirCommitment: "may introduce me to their strategy director", myCommitment: "asked me to send the retail deck", nextAction: "Follow up Tuesday", dueDate: "Tuesday" } }) }] }] }), { status: 200 });
  try {
    const result = await extractCaptureContext("I just met Sarah Ahmed from Company X at LiveX. She works in innovation and understands mobility data from her previous role at Galleria Mall. She was interested in PlacePulse for destination retail. She asked me to send the retail deck and said she may introduce me to their strategy director. Follow up Tuesday.", monday);
    assert.equal(result?.personName, "Sarah Ahmed");
    assert.equal(result?.companyName, "Company X");
    assert.equal(result?.statedRole, "innovation");
    assert.equal(result?.productKey, "PLACEPULSE");
    assert.match(result?.theirCommitment ?? "", /May introduce/);
    assert.match(result?.myCommitment ?? "", /Send retail deck/);
    assert.equal(result?.dueDate, "2026-09-29");
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("OpenAI failure returns null for the existing manual-review fallback", async () => {
  const previousFetch = global.fetch;
  const previousError = console.error;
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  const logs: string[] = [];
  console.error = (...args) => { logs.push(args.join(" ")); };
  global.fetch = async () => new Response(JSON.stringify({ error: { message: "I met someone from ABC. test-key" } }), { status: 503 });
  try {
    assert.equal(await extractCaptureContext("I met someone from ABC.", monday), null);
    assert.match(logs.join(" "), /status=503/);
    assert.doesNotMatch(logs.join(" "), /test-key|someone from ABC/);
  } finally {
    global.fetch = previousFetch;
    console.error = previousError;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});
