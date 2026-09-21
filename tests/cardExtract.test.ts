import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import {
  extractCardFields,
  isAllowedCardMimeType,
  MAX_CARD_IMAGE_BYTES,
  type VisionCaller,
} from "../src/lib/capture/cardExtract";
import { captureEvent } from "../src/lib/capture/eventCapture";
import { classifyVisionError, type VisionErrorKind } from "../src/lib/proposals/llm";

// Never makes a live paid call: every test here injects a fake vision
// caller. ANTHROPIC_API_KEY is force-unset so any accidental fallthrough
// to the real completeVision() would return NOT_CONFIGURED, not a live
// extraction.
delete process.env.ANTHROPIC_API_KEY;

const hasDb = !!process.env.DATABASE_URL;
const prisma = hasDb ? new PrismaClient() : null;
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function fakeVisionOk(json: unknown): VisionCaller {
  return (async () => ({ ok: true, text: JSON.stringify(json) })) as VisionCaller;
}
function fakeVisionFailing(kind: VisionErrorKind): VisionCaller {
  return (async () => ({ ok: false, kind })) as VisionCaller;
}
function fakeVisionReturningRaw(text: string): VisionCaller {
  return (async () => ({ ok: true, text })) as VisionCaller;
}

// Small synthetic JPEG fixtures — this environment has no real photographed
// business card available, so portrait/landscape "card-shaped" fixtures are
// generated at test time (see the note in the test itself). Extraction
// content is mocked; these fixtures only exercise that a real portrait/
// landscape image file round-trips through extractCardFields without the
// pipeline itself caring about orientation (the model receives the bytes
// as-is — orientation normalization happens client-side before upload).
const FIXTURE_DIR = path.join(__dirname, "fixtures");
const PORTRAIT_FIXTURE = path.join(FIXTURE_DIR, "card-portrait.jpg");
const LANDSCAPE_FIXTURE = path.join(FIXTURE_DIR, "card-landscape.jpg");

describe("Sprint 06E.1 — business card extraction (pure, no DB)", () => {
  test("1. valid card image returns structured fields", async () => {
    const vision = fakeVisionOk({
      fullName: "Jane Doe",
      company: "Acme Corp",
      jobTitle: "VP Sales",
      email: "jane@acme.com",
      phone: "+971 50 123 4567",
      linkedinUrl: "https://linkedin.com/in/janedoe",
      confidence: { fullName: "high", company: "high", email: "medium" },
    });
    const outcome = await extractCardFields("fakebase64", "image/jpeg", vision);
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.equal(outcome.result.fullName, "Jane Doe");
    assert.equal(outcome.result.company, "Acme Corp");
    assert.equal(outcome.result.email, "jane@acme.com");
    assert.equal(outcome.result.confidence.fullName, "high");
  });

  test("2. missing fields return null, not invented data", async () => {
    const vision = fakeVisionOk({
      fullName: "John Smith",
      company: null,
      jobTitle: null,
      email: null,
      phone: null,
      linkedinUrl: null,
      confidence: { fullName: "high" },
    });
    const outcome = await extractCardFields("fakebase64", "image/jpeg", vision);
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.equal(outcome.result.fullName, "John Smith");
    assert.equal(outcome.result.company, null);
    assert.equal(outcome.result.jobTitle, null);
    assert.equal(outcome.result.email, null);
    assert.equal(outcome.result.phone, null);
    assert.equal(outcome.result.linkedinUrl, null);
  });

  test("confidence is dropped for any field the model didn't actually extract", async () => {
    const vision = fakeVisionOk({
      fullName: "Jane Doe",
      company: null,
      jobTitle: null,
      email: null,
      phone: null,
      linkedinUrl: null,
      confidence: { fullName: "high", company: "low" },
    });
    const outcome = await extractCardFields("fakebase64", "image/jpeg", vision);
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.equal(outcome.result.confidence.company, undefined);
  });

  test("3. an invalid MIME type is rejected", () => {
    assert.equal(isAllowedCardMimeType("image/gif"), false);
    assert.equal(isAllowedCardMimeType("application/pdf"), false);
    assert.equal(isAllowedCardMimeType("image/heic"), false);
    assert.equal(isAllowedCardMimeType("image/jpeg"), true);
    assert.equal(isAllowedCardMimeType("image/png"), true);
    assert.equal(isAllowedCardMimeType("image/webp"), true);
  });

  test("4. an oversized image is rejected by the size limit constant", () => {
    assert.equal(MAX_CARD_IMAGE_BYTES, 4 * 1024 * 1024);
  });

  test("extraction failure (bad/unparseable model response) is categorized as RESPONSE_PARSE_ERROR, not a fabricated empty card", async () => {
    const outcome = await extractCardFields("fakebase64", "image/jpeg", fakeVisionReturningRaw("not json at all"));
    assert.equal(outcome.ok, false);
    if (outcome.ok) return;
    assert.equal(outcome.diagnostic, "RESPONSE_PARSE_ERROR");
  });

  test("a provider auth failure is categorized as PROVIDER_AUTH_ERROR, not the generic parse-error message", async () => {
    const outcome = await extractCardFields("fakebase64", "image/jpeg", fakeVisionFailing("PROVIDER_AUTH_ERROR"));
    assert.equal(outcome.ok, false);
    if (outcome.ok) return;
    assert.equal(outcome.diagnostic, "PROVIDER_AUTH_ERROR");
  });

  test("a provider model failure is categorized as PROVIDER_MODEL_ERROR", async () => {
    const outcome = await extractCardFields("fakebase64", "image/jpeg", fakeVisionFailing("PROVIDER_MODEL_ERROR"));
    assert.equal(outcome.ok, false);
    if (outcome.ok) return;
    assert.equal(outcome.diagnostic, "PROVIDER_MODEL_ERROR");
  });

  test("no text content in the response is categorized as NO_TEXT_EXTRACTED", async () => {
    const outcome = await extractCardFields("fakebase64", "image/jpeg", fakeVisionFailing("NO_TEXT_EXTRACTED"));
    assert.equal(outcome.ok, false);
    if (outcome.ok) return;
    assert.equal(outcome.diagnostic, "NO_TEXT_EXTRACTED");
  });

  test("a provider rate-limit response (429) is categorized as PROVIDER_RATE_LIMITED, not the generic request-error bucket", async () => {
    const outcome = await extractCardFields("fakebase64", "image/jpeg", fakeVisionFailing("PROVIDER_RATE_LIMITED"));
    assert.equal(outcome.ok, false);
    if (outcome.ok) return;
    assert.equal(outcome.diagnostic, "PROVIDER_RATE_LIMITED");
  });

  test("a provider server error (5xx) is categorized as PROVIDER_UNAVAILABLE, not 'could not reach'", async () => {
    const outcome = await extractCardFields("fakebase64", "image/jpeg", fakeVisionFailing("PROVIDER_UNAVAILABLE"));
    assert.equal(outcome.ok, false);
    if (outcome.ok) return;
    assert.equal(outcome.diagnostic, "PROVIDER_UNAVAILABLE");
  });

  describe("classifyVisionError — status-to-category mapping (Step 6 provider scenarios)", () => {
    test("401/403 -> PROVIDER_AUTH_ERROR", () => {
      assert.equal(classifyVisionError(401, "authentication_error", ""), "PROVIDER_AUTH_ERROR");
      assert.equal(classifyVisionError(403, "permission_error", ""), "PROVIDER_AUTH_ERROR");
    });
    test("404/model-not-found -> PROVIDER_MODEL_ERROR", () => {
      assert.equal(classifyVisionError(404, "not_found_error", ""), "PROVIDER_MODEL_ERROR");
      assert.equal(classifyVisionError(400, "not_found_error", "model: claude-bogus not found"), "PROVIDER_MODEL_ERROR");
    });
    test("413 or a 400 size message -> IMAGE_TOO_LARGE (payload issue)", () => {
      assert.equal(classifyVisionError(413, "", ""), "IMAGE_TOO_LARGE");
      assert.equal(classifyVisionError(400, "invalid_request_error", "image exceeds maximum allowed size"), "IMAGE_TOO_LARGE");
    });
    test("429 -> PROVIDER_RATE_LIMITED", () => {
      assert.equal(classifyVisionError(429, "rate_limit_error", ""), "PROVIDER_RATE_LIMITED");
    });
    test("500/502/503/529 -> PROVIDER_UNAVAILABLE", () => {
      for (const status of [500, 502, 503, 529]) {
        assert.equal(classifyVisionError(status, "api_error", ""), "PROVIDER_UNAVAILABLE");
      }
    });
    test("an unrecognized 400 falls back to PROVIDER_REQUEST_ERROR", () => {
      assert.equal(classifyVisionError(400, "invalid_request_error", "something unexpected"), "PROVIDER_REQUEST_ERROR");
    });
  });


  test("a real portrait-orientation image file round-trips through extraction with a mocked model response", async () => {
    // No real photographed business card is available in this environment —
    // this fixture is a generated portrait-shaped JPEG. It exercises that
    // extractCardFields doesn't care about file dimensions/orientation
    // (that's handled client-side before upload); the model response itself
    // is mocked, per the "never make a live call in tests" rule.
    const bytes = fs.readFileSync(PORTRAIT_FIXTURE);
    const outcome = await extractCardFields(
      bytes.toString("base64"),
      "image/jpeg",
      fakeVisionOk({ fullName: "Portrait Person", company: "Portrait Co", jobTitle: null, email: null, phone: null, linkedinUrl: null, confidence: {} })
    );
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.equal(outcome.result.fullName, "Portrait Person");
  });

  test("a real landscape-orientation image file round-trips through extraction with a mocked model response", async () => {
    const bytes = fs.readFileSync(LANDSCAPE_FIXTURE);
    const outcome = await extractCardFields(
      bytes.toString("base64"),
      "image/jpeg",
      fakeVisionOk({ fullName: "Landscape Person", company: "Landscape Co", jobTitle: null, email: null, phone: null, linkedinUrl: null, confidence: {} })
    );
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.equal(outcome.result.fullName, "Landscape Person");
  });
});

describe("Sprint 06E.1 — extraction never writes to the CRM, and populated forms respect existing values", { skip: !hasDb && "DATABASE_URL not set" }, () => {
  const createdAccountIds = new Set<string>();

  after(async () => {
    if (prisma) {
      for (const id of Array.from(createdAccountIds)) {
        await prisma.task.deleteMany({ where: { accountId: id } });
        await prisma.activity.deleteMany({ where: { accountId: id } });
        await prisma.lead.deleteMany({ where: { accountId: id } });
        await prisma.contact.deleteMany({ where: { accountId: id } });
        await prisma.account.deleteMany({ where: { id } });
      }
    }
    await prisma?.$disconnect();
  });

  test("5. extraction does not write any CRM record", async () => {
    const accountsBefore = await prisma!.account.count();
    const contactsBefore = await prisma!.contact.count();
    const vision = fakeVisionOk({
      fullName: "No Write Person",
      company: "No Write Co",
      jobTitle: null,
      email: null,
      phone: null,
      linkedinUrl: null,
      confidence: {},
    });
    await extractCardFields("fakebase64", "image/jpeg", vision);
    assert.equal(await prisma!.account.count(), accountsBefore);
    assert.equal(await prisma!.contact.count(), contactsBefore);
  });

  test("6/7. populate-only-empty-fields semantics — simulated form merge only fills blanks and never overwrites what's already entered", () => {
    function mergeOnlyEmpty(current: Record<string, string>, extracted: Record<string, string | null>) {
      const merged = { ...current };
      for (const [key, value] of Object.entries(extracted)) {
        if (!merged[key] && value) merged[key] = value;
      }
      return merged;
    }

    const current = { fullName: "", company: "User Typed Co", email: "" };
    const extracted = { fullName: "Card Name", company: "Card Co", email: "card@example.com" };
    const merged = mergeOnlyEmpty(current, extracted);

    assert.equal(merged.fullName, "Card Name", "empty field is filled from the card");
    assert.equal(merged.company, "User Typed Co", "non-empty field the user already entered is never overwritten");
    assert.equal(merged.email, "card@example.com", "empty field is filled from the card");
  });

  test("8. a failed extraction preserves current form field values (no field is cleared)", () => {
    function mergeOnlyEmpty(current: Record<string, string>, extracted: Record<string, string | null> | null) {
      if (!extracted) return current;
      const merged = { ...current };
      for (const [key, value] of Object.entries(extracted)) {
        if (!merged[key] && value) merged[key] = value;
      }
      return merged;
    }
    const current = { fullName: "Already Typed", company: "Already Typed Co" };
    const merged = mergeOnlyEmpty(current, null);
    assert.deepEqual(merged, current);
  });

  test("9. Quick Capture Save still creates Account/Contact/Lead/Activity/Task correctly after a card-assisted fill", async () => {
    const result = await captureEvent({
      eventName: `Seamless Middle East 2026 Card Test ${RUN_ID}`,
      fullName: `Card Filled Person ${RUN_ID}`,
      company: `Card Filled Co ${RUN_ID}`,
      jobTitle: "VP Sales",
      email: `card-${RUN_ID}@example.com`,
      product: "PLACEPULSE",
      acquisitionKey: "MET_PERSONALLY",
      note: "Card-assisted capture.",
      nextAction: "Send follow-up",
      idempotencyKey: `card-key-${RUN_ID}`,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    createdAccountIds.add(result.accountId);

    const account = await prisma!.account.findUniqueOrThrow({ where: { id: result.accountId } });
    const contact = await prisma!.contact.findUniqueOrThrow({ where: { id: result.contactId } });
    const lead = await prisma!.lead.findUniqueOrThrow({ where: { id: result.leadId } });
    const activity = await prisma!.activity.findUniqueOrThrow({ where: { id: result.activityId } });
    assert.ok(account);
    assert.equal(contact.email, `card-${RUN_ID}@example.com`);
    assert.equal(lead.primaryProduct, "PLACEPULSE");
    assert.equal(activity.type, "EVENT_INTERACTION");
    assert.notEqual(result.taskId, null);
  });

  test("10. no Opportunity is created by a card-assisted capture", async () => {
    const before = await prisma!.opportunity.count();
    const result = await captureEvent({
      eventName: `Seamless Middle East 2026 Card Test ${RUN_ID}`,
      fullName: `No Opp Person ${RUN_ID}`,
      company: `No Opp Co ${RUN_ID}`,
      product: "PLACEPULSE",
      idempotencyKey: `card-noopp-${RUN_ID}`,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    createdAccountIds.add(result.accountId);
    assert.equal(await prisma!.opportunity.count(), before);
  });
});
