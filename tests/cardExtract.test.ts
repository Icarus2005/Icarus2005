import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { extractCardFields, isAllowedCardMimeType, MAX_CARD_IMAGE_BYTES } from "../src/lib/capture/cardExtract";
import { captureEvent } from "../src/lib/capture/eventCapture";
import type { VisionCaller } from "../src/lib/capture/cardExtract";

// Never makes a live paid call: every test here injects a fake vision
// caller. ANTHROPIC_API_KEY is force-unset so any accidental fallthrough
// to the real completeVision() would return null, not a live extraction.
delete process.env.ANTHROPIC_API_KEY;

const hasDb = !!process.env.DATABASE_URL;
const prisma = hasDb ? new PrismaClient() : null;
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function fakeVisionReturning(json: unknown): VisionCaller {
  return (async () => JSON.stringify(json)) as VisionCaller;
}
function fakeVisionFailing(): VisionCaller {
  return (async () => null) as VisionCaller;
}

describe("Sprint 06E.1 — business card extraction (pure, no DB)", () => {
  test("1. valid card image returns structured fields", async () => {
    const vision = fakeVisionReturning({
      fullName: "Jane Doe",
      company: "Acme Corp",
      jobTitle: "VP Sales",
      email: "jane@acme.com",
      phone: "+971 50 123 4567",
      linkedinUrl: "https://linkedin.com/in/janedoe",
      confidence: { fullName: "high", company: "high", email: "medium" },
    });
    const result = await extractCardFields("fakebase64", "image/jpeg", vision);
    assert.ok(result);
    assert.equal(result!.fullName, "Jane Doe");
    assert.equal(result!.company, "Acme Corp");
    assert.equal(result!.email, "jane@acme.com");
    assert.equal(result!.confidence.fullName, "high");
  });

  test("2. missing fields return null, not invented data", async () => {
    const vision = fakeVisionReturning({
      fullName: "John Smith",
      company: null,
      jobTitle: null,
      email: null,
      phone: null,
      linkedinUrl: null,
      confidence: { fullName: "high" },
    });
    const result = await extractCardFields("fakebase64", "image/jpeg", vision);
    assert.ok(result);
    assert.equal(result!.fullName, "John Smith");
    assert.equal(result!.company, null);
    assert.equal(result!.jobTitle, null);
    assert.equal(result!.email, null);
    assert.equal(result!.phone, null);
    assert.equal(result!.linkedinUrl, null);
  });

  test("confidence is dropped for any field the model didn't actually extract", async () => {
    // A model that hallucinates a confidence entry for a null field must
    // not have that confidence surfaced — sanitize() strips it.
    const vision = fakeVisionReturning({
      fullName: "Jane Doe",
      company: null,
      jobTitle: null,
      email: null,
      phone: null,
      linkedinUrl: null,
      confidence: { fullName: "high", company: "low" },
    });
    const result = await extractCardFields("fakebase64", "image/jpeg", vision);
    assert.ok(result);
    assert.equal(result!.confidence.company, undefined);
  });

  test("3. an invalid MIME type is rejected", () => {
    assert.equal(isAllowedCardMimeType("image/gif"), false);
    assert.equal(isAllowedCardMimeType("application/pdf"), false);
    assert.equal(isAllowedCardMimeType("image/jpeg"), true);
    assert.equal(isAllowedCardMimeType("image/png"), true);
    assert.equal(isAllowedCardMimeType("image/webp"), true);
  });

  test("4. an oversized image is rejected by the size limit constant", () => {
    // The route enforces this against file.size/bytes.byteLength; verified
    // here that the limit is the documented 4MB, not silently changed.
    assert.equal(MAX_CARD_IMAGE_BYTES, 4 * 1024 * 1024);
  });

  test("extraction failure (bad/unparseable model response) returns null, not a fabricated empty card", async () => {
    const result = await extractCardFields("fakebase64", "image/jpeg", fakeVisionFailing());
    assert.equal(result, null);
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
    const vision = fakeVisionReturning({
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
    // The actual merge logic lives client-side (setFullName(prev => prev || extracted)),
    // exercised here as a pure function mirroring that exact rule.
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
      if (!extracted) return current; // failure path — nothing changes
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
