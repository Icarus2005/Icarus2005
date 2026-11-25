import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { inquirySourceKey, parseInvestorInquiry, verifyInvestorWebhook, investorWebhookSecret } from "../src/lib/fundraising/inboundAuth";

const SECRET = "local-disposable-investor-webhook-test-only-32-plus-chars";
const time = 1795570000;
const payload = {
  eventId: "inquiry-20261125-abcdef123456",
  roundKey: "brandsprk-preseed-2026",
  fullName: "Synthetic Investor",
  organization: "Synthetic Ventures",
  email: "INVESTOR@example.test",
  message: "Please share an overview of your workflow.",
  sourcePage: "https://www.brandsprk.io/invest",
  consent: true,
  consentVersion: "2026-11",
};

test("only well-formed, explicitly consented investor enquiries enter the intake", () => {
  const body = parseInvestorInquiry(payload);
  assert.equal(body.email, "investor@example.test");
  assert.equal(body.roundKey, "brandsprk-preseed-2026");
  assert.equal(body.consent, true);
  assert.throws(() => parseInvestorInquiry({ ...payload, consent: false }), /consent/);
  assert.throws(() => parseInvestorInquiry({ ...payload, roundKey: "not-a-round" }), /round/);
  assert.throws(() => parseInvestorInquiry({ ...payload, sourcePage: "https://www.placepulse.io/invest" }), /source/);
  assert.throws(() => parseInvestorInquiry({ ...payload, email: "invalid-email" }), /email/);
  assert.throws(() => parseInvestorInquiry({ ...payload, message: "x".repeat(1501) }), /message/);
});

test("PlacePulse investor enquiries remain in a separate round", () => {
  const body = parseInvestorInquiry({ ...payload, roundKey: "placepulse-preseed-2026", sourcePage: "https://www.placepulse.io/invest" });
  assert.equal(body.roundKey, "placepulse-preseed-2026");
  assert.notEqual(inquirySourceKey(body), inquirySourceKey(parseInvestorInquiry(payload)));
  assert.equal(inquirySourceKey(body), inquirySourceKey(body));
});

test("HMAC is time-bounded, byte-exact, and fails closed when disabled", () => {
  const rawBody = JSON.stringify(payload);
  const timestamp = String(time);
  const signature = createHmac("sha256", SECRET).update(`${timestamp}.${rawBody}`).digest("hex");
  const args = { secret: SECRET, timestamp, signature, rawBody, nowSeconds: time };
  assert.equal(verifyInvestorWebhook(args), true);
  assert.equal(verifyInvestorWebhook({ ...args, rawBody: rawBody + " " }), false);
  assert.equal(verifyInvestorWebhook({ ...args, signature: signature.slice(0, -1) + (signature.endsWith("0") ? "1" : "0") }), false);
  assert.equal(verifyInvestorWebhook({ ...args, secret: undefined }), false);
  assert.equal(verifyInvestorWebhook({ ...args, secret: "too-short" }), false);
  assert.equal(verifyInvestorWebhook({ ...args, nowSeconds: time + 301 }), false);
  assert.equal(verifyInvestorWebhook({ ...args, timestamp: "invalid" }), false);
  assert.equal(verifyInvestorWebhook({ ...args, signature: "not-a-signature" }), false);
});

test("each venture uses an independent signing key; reused keys fail closed", () => {
  const env = {
    CRM_INBOUND_INVESTOR_BRANDSPRK_SECRET: SECRET,
    CRM_INBOUND_INVESTOR_PLACEPULSE_SECRET: SECRET + "-place",
  };
  assert.equal(investorWebhookSecret("brandsprk-preseed-2026", env), SECRET);
  assert.equal(investorWebhookSecret("placepulse-preseed-2026", env), SECRET + "-place");
  assert.equal(investorWebhookSecret("placepulse-preseed-2026", { ...env, CRM_INBOUND_INVESTOR_PLACEPULSE_SECRET: SECRET }), undefined);
  assert.equal(investorWebhookSecret("placepulse-preseed-2026", {}), undefined);
  const rawBody = Buffer.from(JSON.stringify({ ...payload, message: "Résumé — investor" }));
  const timestamp = String(time);
  const signature = createHmac("sha256", SECRET).update(timestamp + ".").update(rawBody).digest("hex");
  assert.equal(verifyInvestorWebhook({ secret: SECRET, timestamp, signature, rawBody, nowSeconds: time }), true);
  assert.equal(verifyInvestorWebhook({ secret: SECRET + "-place", timestamp, signature, rawBody, nowSeconds: time }), false);
});
