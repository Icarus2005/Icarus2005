import { test } from "node:test";
import assert from "node:assert/strict";
import { betaIntroduction, defaultOutreachStep, newZohoSendBlock, type OutreachRoute } from "../src/lib/fundraising/outreachFocus";

const route: OutreachRoute = { id: "synthetic", status: "NOT_STARTED", priority: "Now", sourceStatus: "Not started", firstSentAt: null, tasks: [], dispatches: [] };
const send = { configured: true, recipient: "investor@example.test", crossVentureContacted: false, kind: "INITIAL", condition: "Verify recipient", routeChangesPending: false };

test("message-first outreach suggests the appropriate recorded sequence step", () => {
  assert.equal(defaultOutreachStep(route), "INITIAL");
  const contacted = { ...route, status: "CONTACTED", firstSentAt: "2026-11-20T09:00:00Z" };
  assert.equal(defaultOutreachStep({ ...contacted, tasks: [{ id: "fundraise_synthetic_1", dueDate: null }, { id: "fundraise_synthetic_2", dueDate: null }] }), "FOLLOWUP_1");
  assert.equal(defaultOutreachStep({ ...contacted, tasks: [{ id: "fundraise_synthetic_2", dueDate: null }] }), "FOLLOWUP_2");
  assert.equal(defaultOutreachStep({ ...contacted, status: "REPLIED" }), "RESPONSE");
});
test("outreach view does not bypass historical, duplicate, uncertain-delivery or contact gates", () => {
  assert.equal(newZohoSendBlock(route, send), null);
  assert.match(newZohoSendBlock({ ...route, sourceStatus: "Submitted previously" }, send) ?? "", /Historical submission/);
  assert.match(newZohoSendBlock({ ...route, status: "SUBMITTED_PREVIOUSLY" }, send) ?? "", /Historical submission/);
  assert.match(newZohoSendBlock(route, { ...send, condition: "Reply in original acknowledgement thread" }) ?? "", /Historical submission/);
  assert.match(newZohoSendBlock(route, { ...send, crossVentureContacted: true }) ?? "", /other venture/);
  assert.match(newZohoSendBlock(route, { ...send, recipient: null }) ?? "", /verified CRM contact/);
  assert.match(newZohoSendBlock(route, { ...send, routeChangesPending: true }) ?? "", /Save contact/);
  assert.match(newZohoSendBlock(route, { ...send, configured: false }) ?? "", /not configured/);
  assert.match(newZohoSendBlock({ ...route, dispatches: [{ state: "UNCERTAIN" }] }, send) ?? "", /Resolve/);
  assert.match(newZohoSendBlock({ ...route, priority: "Hold" }, send) ?? "", /not open/);
  assert.match(newZohoSendBlock({ ...route, firstSentAt: "2026-11-20T09:00:00Z" }, send) ?? "", /existing conversation/);
});
test("fresh introduction template keeps venture facts and briefing links separate", () => {
  const brand = betaIntroduction("brandsprk-preseed-2026");
  const place = betaIntroduction("placepulse-preseed-2026");
  assert.ok(brand.body.includes("$300,000") && brand.body.includes("https://www.brandsprk.io/invest"));
  assert.ok(!brand.body.includes("placepulse.io"));
  assert.ok(place.body.includes("$1,500,000") && place.body.includes("https://www.placepulse.io/invest"));
  assert.ok(!place.body.includes("brandsprk.io"));
  assert.match(brand.body, /live in beta/);
  assert.match(place.body, /live in beta/);
});
