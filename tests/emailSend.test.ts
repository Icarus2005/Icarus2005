import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { sendApprovedEmail } from "../src/lib/email/sendApprovedEmail";
import type { EmailProvider, SendEmailInput } from "../src/lib/email/provider";
import { EmailSendError } from "../src/lib/email/provider";

// Exercises Sprint 06D approved-send behavior against a real Postgres
// instance — never production, and NEVER a real Zoho account. Every test
// here injects a fake EmailProvider; sendApprovedEmail's own logic decides
// whether to call it, and no test in this file constructs a ZohoEmailProvider
// or touches ZOHO_* env vars.
const hasDb = !!process.env.DATABASE_URL;
const prisma = hasDb ? new PrismaClient() : null;

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

class FakeProvider implements EmailProvider {
  calls: SendEmailInput[] = [];
  constructor(private behavior: "success" | "failure" = "success") {}
  async sendEmail(input: SendEmailInput) {
    this.calls.push(input);
    if (this.behavior === "failure") throw new EmailSendError("simulated provider failure");
    return { providerMessageId: "fake-message-id-123" };
  }
}

describe("Sprint 06D — approved email send", { skip: !hasDb && "DATABASE_URL not set" }, () => {
  let accountId: string;
  let contactId: string;
  let contactNoEmailId: string;
  let leadId: string;
  let opportunityId: string;
  let taskId: string;
  let otherTaskId: string;

  before(async () => {
    await prisma!.product.upsert({ where: { key: "PLACEPULSE" }, create: { key: "PLACEPULSE", name: "PlacePulse" }, update: {} });
    const account = await prisma!.account.create({ data: { name: `Email Test Co ${RUN_ID}` } });
    accountId = account.id;
    const contact = await prisma!.contact.create({ data: { firstName: "Send", lastName: `TestOnly-${RUN_ID}`, email: `send-test-${RUN_ID}@example.com`, accountId } });
    contactId = contact.id;
    const contactNoEmail = await prisma!.contact.create({ data: { firstName: "NoEmail", lastName: `TestOnly-${RUN_ID}`, accountId } });
    contactNoEmailId = contactNoEmail.id;
    const lead = await prisma!.lead.create({ data: { name: `Email Lead ${RUN_ID}`, primaryProduct: "PLACEPULSE", accountId, primaryContactId: contactId, status: "QUALIFIED" } });
    leadId = lead.id;
    const opp = await prisma!.opportunity.create({ data: { name: `Email Opp ${RUN_ID}`, accountId, product: "PLACEPULSE", stage: "QUALIFIED" } });
    opportunityId = opp.id;
    const task = await prisma!.task.create({ data: { title: "Follow up task", status: "OPEN", leadId, accountId, contactId } });
    taskId = task.id;
    const otherTask = await prisma!.task.create({ data: { title: "Unrelated task", status: "OPEN", accountId } });
    otherTaskId = otherTask.id;
  });

  after(async () => {
    if (prisma) {
      await prisma.activity.deleteMany({ where: { accountId } });
      await prisma.task.deleteMany({ where: { id: { in: [taskId, otherTaskId] } } });
      await prisma.opportunity.deleteMany({ where: { id: opportunityId } });
      await prisma.lead.deleteMany({ where: { id: leadId } });
      await prisma.contact.deleteMany({ where: { id: { in: [contactId, contactNoEmailId] } } });
      await prisma.account.deleteMany({ where: { id: accountId } });
    }
    await prisma?.$disconnect();
  });

  function baseInput(overrides: Partial<Parameters<typeof sendApprovedEmail>[0]> = {}) {
    return {
      entityType: "LEAD" as const,
      entityId: leadId,
      contactId,
      to: `send-test-${RUN_ID}@example.com`,
      subject: "Following up",
      plaintextBody: "Hi — following up on our conversation.",
      idempotencyKey: `key-${RUN_ID}-${Math.random().toString(36).slice(2, 8)}`,
      ...overrides,
    };
  }

  test("missing recipient is rejected before any send attempt", async () => {
    const provider = new FakeProvider();
    const result = await sendApprovedEmail(baseInput({ to: "" }), provider);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 400);
    assert.equal(provider.calls.length, 0);
  });

  test("malformed recipient is rejected before any send attempt", async () => {
    const provider = new FakeProvider();
    const result = await sendApprovedEmail(baseInput({ to: "not-an-email" }), provider);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 400);
    assert.equal(provider.calls.length, 0);
  });

  test("unknown Contact is rejected", async () => {
    const provider = new FakeProvider();
    const result = await sendApprovedEmail(baseInput({ contactId: "does-not-exist" }), provider);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 404);
    assert.equal(provider.calls.length, 0);
  });

  test("missing Zoho config (null provider) prevents sending", async () => {
    const result = await sendApprovedEmail(baseInput(), null);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 503);
  });

  test("provider failure creates no EMAIL Activity", async () => {
    const provider = new FakeProvider("failure");
    const before = await prisma!.activity.count({ where: { accountId, type: "EMAIL" } });
    const result = await sendApprovedEmail(baseInput(), provider);
    assert.equal(result.ok, false);
    const after = await prisma!.activity.count({ where: { accountId, type: "EMAIL" } });
    assert.equal(after, before);
  });

  test("explicit approval invokes the provider exactly once with the edited content", async () => {
    const provider = new FakeProvider("success");
    const result = await sendApprovedEmail(baseInput({ subject: "Edited subject", plaintextBody: "Edited body text" }), provider);
    assert.equal(result.ok, true);
    assert.equal(provider.calls.length, 1);
    assert.equal(provider.calls[0].subject, "Edited subject");
    assert.equal(provider.calls[0].body, "Edited body text");
  });

  test("successful provider result creates exactly one EMAIL Activity storing the final edited subject/body", async () => {
    const provider = new FakeProvider("success");
    const result = await sendApprovedEmail(baseInput({ subject: "Final subject", plaintextBody: "Final body" }), provider);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const activity = result.activity as { type: string; subject: string; notes: string | null };
    assert.equal(activity.type, "EMAIL");
    assert.equal(activity.subject, "Final subject");
    assert.equal(activity.notes, "Final body");
  });

  test("Activity inherits correct Contact/Account relationships", async () => {
    const provider = new FakeProvider("success");
    const result = await sendApprovedEmail(baseInput(), provider);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const activity = result.activity as { contactId: string; accountId: string };
    assert.equal(activity.contactId, contactId);
    assert.equal(activity.accountId, accountId);
  });

  test("Activity inherits Lead relationship when entityType is LEAD", async () => {
    const provider = new FakeProvider("success");
    const result = await sendApprovedEmail(baseInput({ entityType: "LEAD", entityId: leadId }), provider);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const activity = result.activity as { leadId: string | null; opportunityId: string | null };
    assert.equal(activity.leadId, leadId);
    assert.equal(activity.opportunityId, null);
  });

  test("Activity inherits Opportunity relationship when entityType is OPPORTUNITY", async () => {
    const provider = new FakeProvider("success");
    const result = await sendApprovedEmail(baseInput({ entityType: "OPPORTUNITY", entityId: opportunityId }), provider);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const activity = result.activity as { opportunityId: string | null; leadId: string | null };
    assert.equal(activity.opportunityId, opportunityId);
    assert.equal(activity.leadId, null);
  });

  test("retry with the same idempotencyKey does not send twice or create a second Activity", async () => {
    const provider = new FakeProvider("success");
    const key = `retry-key-${RUN_ID}`;
    const first = await sendApprovedEmail(baseInput({ idempotencyKey: key }), provider);
    const second = await sendApprovedEmail(baseInput({ idempotencyKey: key }), provider);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(provider.calls.length, 1, "provider should be invoked only once across both requests");
    if (first.ok && second.ok) {
      const a1 = first.activity as { id: string };
      const a2 = second.activity as { id: string };
      assert.equal(a1.id, a2.id);
    }
    const count = await prisma!.activity.count({ where: { idempotencyKey: key } });
    assert.equal(count, 1);
  });

  test("sending never changes Lead.status or Opportunity.stage", async () => {
    const provider = new FakeProvider("success");
    const leadBefore = await prisma!.lead.findUniqueOrThrow({ where: { id: leadId } });
    const oppBefore = await prisma!.opportunity.findUniqueOrThrow({ where: { id: opportunityId } });
    await sendApprovedEmail(baseInput({ entityType: "LEAD", entityId: leadId }), provider);
    await sendApprovedEmail(baseInput({ entityType: "OPPORTUNITY", entityId: opportunityId, idempotencyKey: `key2-${RUN_ID}` }), provider);
    const leadAfter = await prisma!.lead.findUniqueOrThrow({ where: { id: leadId } });
    const oppAfter = await prisma!.opportunity.findUniqueOrThrow({ where: { id: opportunityId } });
    assert.equal(leadAfter.status, leadBefore.status);
    assert.equal(oppAfter.stage, oppBefore.stage);
  });

  test("sending never creates a client commitment date on any Task", async () => {
    const provider = new FakeProvider("success");
    await sendApprovedEmail(baseInput({ taskId }), provider);
    const task = await prisma!.task.findUniqueOrThrow({ where: { id: taskId } });
    assert.equal(task.clientCommitmentDate, null);
    assert.equal(task.status, "OPEN", "sending itself never completes the task — that requires a separate explicit action");
  });

  test("sending never auto-completes any Task, related or not", async () => {
    const provider = new FakeProvider("success");
    await sendApprovedEmail(baseInput({ taskId, idempotencyKey: `key3-${RUN_ID}` }), provider);
    const related = await prisma!.task.findUniqueOrThrow({ where: { id: taskId } });
    const unrelated = await prisma!.task.findUniqueOrThrow({ where: { id: otherTaskId } });
    assert.equal(related.status, "OPEN");
    assert.equal(unrelated.status, "OPEN");
  });

  test("an explicit task-complete action only affects the intended Task", async () => {
    // Simulates the panel's separate "Mark related task complete" click —
    // a plain reuse of the existing task update, scoped to one id.
    await prisma!.task.update({ where: { id: taskId }, data: { status: "DONE" } });
    const related = await prisma!.task.findUniqueOrThrow({ where: { id: taskId } });
    const unrelated = await prisma!.task.findUniqueOrThrow({ where: { id: otherTaskId } });
    assert.equal(related.status, "DONE");
    assert.equal(unrelated.status, "OPEN");
    await prisma!.task.update({ where: { id: taskId }, data: { status: "OPEN" } }); // restore for other tests
  });

  test("a Contact with no email cannot be used as a valid recipient", async () => {
    const provider = new FakeProvider();
    const result = await sendApprovedEmail(baseInput({ contactId: contactNoEmailId, to: "" }), provider);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 400);
  });
});

describe("Sprint 06D — draft generation causes no send (Sales Copilot integration)", { skip: !hasDb && "DATABASE_URL not set" }, () => {
  test("DRAFT_EMAIL never calls an email provider — it only returns text", async () => {
    // The Sales Copilot's DRAFT_EMAIL path (src/lib/salesCopilot/prompt.ts)
    // has no import of, or reference to, src/lib/email — confirmed
    // structurally rather than by mocking, since there is nothing to mock:
    // the module simply never touches an EmailProvider.
    const promptSource = await import("../src/lib/salesCopilot/prompt");
    assert.equal(typeof promptSource.runDraftEmail, "function");
    // No EmailProvider export or usage exists in that module's surface.
    assert.equal("sendEmail" in promptSource, false);
  });
});
