import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { captureEvent, type CaptureEventInput } from "../src/lib/capture/eventCapture";

// Exercises Sprint 06E Quick Capture logic against a real Postgres instance
// — never production. Requires DATABASE_URL. Skips itself otherwise.
const hasDb = !!process.env.DATABASE_URL;
const prisma = hasDb ? new PrismaClient() : null;

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const EVENT_NAME = `Seamless Middle East 2026 Test ${RUN_ID}`;

function baseInput(overrides: Partial<CaptureEventInput> = {}): CaptureEventInput {
  return {
    eventName: EVENT_NAME,
    fullName: `Test Person ${RUN_ID}`,
    company: `Test Company ${RUN_ID}`,
    product: "PLACEPULSE",
    idempotencyKey: `key-${RUN_ID}-${Math.random().toString(36).slice(2, 8)}`,
    ...overrides,
  };
}

describe("Sprint 06E — Quick Capture", { skip: !hasDb && "DATABASE_URL not set" }, () => {
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

  test("1. brand-new company + contact creates NEW_ACCOUNT_NEW_CONTACT", async () => {
    const result = await captureEvent(baseInput());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.classification, "NEW_ACCOUNT_NEW_CONTACT");
    createdAccountIds.add(result.accountId);
  });

  test("2. existing company + new contact creates EXISTING_ACCOUNT_NEW_CONTACT", async () => {
    const company = `Reused Co ${RUN_ID}`;
    const first = await captureEvent(baseInput({ company, fullName: `First Person ${RUN_ID}` }));
    assert.equal(first.ok, true);
    if (!first.ok) return;
    createdAccountIds.add(first.accountId);

    const second = await captureEvent(baseInput({ company, fullName: `Second Person ${RUN_ID}`, idempotencyKey: `key2-${RUN_ID}` }));
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.classification, "EXISTING_ACCOUNT_NEW_CONTACT");
    assert.equal(second.accountId, first.accountId, "should reuse the same Account, not create a duplicate");
  });

  test("3. exact email match reuses the existing contact", async () => {
    const email = `exact-${RUN_ID}@example.com`;
    const first = await captureEvent(baseInput({ email, fullName: `Email Person ${RUN_ID}`, company: `Email Co ${RUN_ID}` }));
    assert.equal(first.ok, true);
    if (!first.ok) return;
    createdAccountIds.add(first.accountId);

    const second = await captureEvent(
      baseInput({ email, fullName: `Email Person ${RUN_ID}`, company: `Email Co ${RUN_ID}`, idempotencyKey: `key3-${RUN_ID}` })
    );
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.classification, "EXISTING_CONTACT");
    assert.equal(second.contactId, first.contactId);
  });

  test("4. exact name+account match (no email) reuses the existing contact", async () => {
    const company = `Name Match Co ${RUN_ID}`;
    const fullName = `Name Match Person ${RUN_ID}`;
    const first = await captureEvent(baseInput({ company, fullName }));
    assert.equal(first.ok, true);
    if (!first.ok) return;
    createdAccountIds.add(first.accountId);

    const second = await captureEvent(baseInput({ company, fullName, idempotencyKey: `key4-${RUN_ID}` }));
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.classification, "EXISTING_CONTACT");
    assert.equal(second.contactId, first.contactId);
  });

  test("5. existing Contact with a blank email is safely enriched", async () => {
    const company = `Enrich Co ${RUN_ID}`;
    const fullName = `Enrich Person ${RUN_ID}`;
    const first = await captureEvent(baseInput({ company, fullName })); // no email
    assert.equal(first.ok, true);
    if (!first.ok) return;
    createdAccountIds.add(first.accountId);
    const contactBefore = await prisma!.contact.findUniqueOrThrow({ where: { id: first.contactId } });
    assert.equal(contactBefore.email, null);

    const newEmail = `enriched-${RUN_ID}@example.com`;
    const second = await captureEvent(baseInput({ company, fullName, email: newEmail, idempotencyKey: `key5-${RUN_ID}` }));
    assert.equal(second.ok, true);
    if (!second.ok) return;
    const contactAfter = await prisma!.contact.findUniqueOrThrow({ where: { id: second.contactId } });
    assert.equal(contactAfter.email, newEmail);
  });

  test("6. existing non-null fields are never overwritten", async () => {
    const company = `NoOverwrite Co ${RUN_ID}`;
    const fullName = `NoOverwrite Person ${RUN_ID}`;
    const first = await captureEvent(baseInput({ company, fullName, jobTitle: "Original Title" }));
    assert.equal(first.ok, true);
    if (!first.ok) return;
    createdAccountIds.add(first.accountId);

    const second = await captureEvent(baseInput({ company, fullName, jobTitle: "Different Title", idempotencyKey: `key6-${RUN_ID}` }));
    assert.equal(second.ok, true);
    if (!second.ok) return;
    const contact = await prisma!.contact.findUniqueOrThrow({ where: { id: second.contactId } });
    assert.equal(contact.title, "Original Title", "a non-null field must never be silently overwritten");
  });

  test("7. exact email match against a different name/account triggers REVIEW_REQUIRED and writes nothing", async () => {
    const email = `conflict-${RUN_ID}@example.com`;
    const first = await captureEvent(baseInput({ email, fullName: `Original Owner ${RUN_ID}`, company: `Original Co ${RUN_ID}` }));
    assert.equal(first.ok, true);
    if (!first.ok) return;
    createdAccountIds.add(first.accountId);

    const activityCountBefore = await prisma!.activity.count();
    const conflicting = await captureEvent(
      baseInput({ email, fullName: `Totally Different Person ${RUN_ID}`, company: `Totally Different Co ${RUN_ID}`, idempotencyKey: `key7-${RUN_ID}` })
    );
    assert.equal(conflicting.ok, false);
    if (conflicting.ok) return;
    assert.equal(conflicting.status, 409);
    assert.equal((conflicting as { classification: string }).classification, "REVIEW_REQUIRED");
    const activityCountAfter = await prisma!.activity.count();
    assert.equal(activityCountAfter, activityCountBefore, "REVIEW_REQUIRED must not write anything");
  });

  test("8. Activity is always created on a successful capture", async () => {
    const result = await captureEvent(baseInput({ company: `ActivityAlways Co ${RUN_ID}` }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    createdAccountIds.add(result.accountId);
    const activity = await prisma!.activity.findUniqueOrThrow({ where: { id: result.activityId } });
    assert.equal(activity.type, "EVENT_INTERACTION");
  });

  test("9. Task is only created when a next action is provided", async () => {
    const withAction = await captureEvent(baseInput({ company: `TaskYes Co ${RUN_ID}`, nextAction: "Follow up next week" }));
    assert.equal(withAction.ok, true);
    if (withAction.ok) {
      createdAccountIds.add(withAction.accountId);
      assert.notEqual(withAction.taskId, null);
    }

    const withoutAction = await captureEvent(baseInput({ company: `TaskNo Co ${RUN_ID}`, idempotencyKey: `key9b-${RUN_ID}` }));
    assert.equal(withoutAction.ok, true);
    if (withoutAction.ok) {
      createdAccountIds.add(withoutAction.accountId);
      assert.equal(withoutAction.taskId, null);
    }
  });

  test("10. dueDate is stored only as the internal Task.dueDate", async () => {
    const due = new Date();
    due.setDate(due.getDate() + 1);
    const dueDateStr = due.toISOString().split("T")[0];
    const result = await captureEvent(
      baseInput({ company: `DueDate Co ${RUN_ID}`, nextAction: "Send follow-up", dueDate: dueDateStr })
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    createdAccountIds.add(result.accountId);
    const task = await prisma!.task.findUniqueOrThrow({ where: { id: result.taskId! } });
    assert.equal(task.dueDate?.toISOString().split("T")[0], dueDateStr);
  });

  test("11. clientCommitmentDate always remains null", async () => {
    const result = await captureEvent(baseInput({ company: `CCD Co ${RUN_ID}`, nextAction: "Follow up" }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    createdAccountIds.add(result.accountId);
    const task = await prisma!.task.findUniqueOrThrow({ where: { id: result.taskId! } });
    assert.equal(task.clientCommitmentDate, null);
  });

  test("12. no Opportunity is ever created", async () => {
    const before = await prisma!.opportunity.count();
    const result = await captureEvent(baseInput({ company: `NoOpp Co ${RUN_ID}` }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    createdAccountIds.add(result.accountId);
    const after = await prisma!.opportunity.count();
    assert.equal(after, before);
  });

  test("13. Lead is never auto-qualified — always created as NEW", async () => {
    const result = await captureEvent(baseInput({ company: `NewStatus Co ${RUN_ID}` }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    createdAccountIds.add(result.accountId);
    const lead = await prisma!.lead.findUniqueOrThrow({ where: { id: result.leadId } });
    assert.equal(lead.status, "NEW");
  });

  test("14. no duplicate Account is created on exact deterministic name match", async () => {
    const company = `DedupeAccount Co ${RUN_ID}`;
    const first = await captureEvent(baseInput({ company, fullName: `Person A ${RUN_ID}` }));
    assert.equal(first.ok, true);
    if (!first.ok) return;
    createdAccountIds.add(first.accountId);
    const second = await captureEvent(baseInput({ company, fullName: `Person B ${RUN_ID}`, idempotencyKey: `key14-${RUN_ID}` }));
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.accountId, first.accountId);
    const accountsNamed = await prisma!.account.count({ where: { name: company } });
    assert.equal(accountsNamed, 1);
  });

  test("15. repeated submission with the same idempotencyKey does not create a duplicate Activity", async () => {
    const key = `key15-${RUN_ID}`;
    const first = await captureEvent(baseInput({ company: `Idempotent Co ${RUN_ID}`, idempotencyKey: key }));
    assert.equal(first.ok, true);
    if (!first.ok) return;
    createdAccountIds.add(first.accountId);
    const second = await captureEvent(baseInput({ company: `Idempotent Co ${RUN_ID}`, idempotencyKey: key }));
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.activityId, first.activityId);
    const count = await prisma!.activity.count({ where: { idempotencyKey: key } });
    assert.equal(count, 1);
  });

  test("unrelated records are excluded — a capture never touches another company's Account", async () => {
    const untouchedCompany = `Untouched Co ${RUN_ID}`;
    const untouched = await prisma!.account.create({ data: { name: untouchedCompany } });
    createdAccountIds.add(untouched.id);

    const result = await captureEvent(baseInput({ company: `Different Co ${RUN_ID}` }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    createdAccountIds.add(result.accountId);
    assert.notEqual(result.accountId, untouched.id);
  });

  test("missing required fields are rejected before any write", async () => {
    const before = await prisma!.account.count();
    const result = await captureEvent(baseInput({ fullName: "" }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 400);
    const after = await prisma!.account.count();
    assert.equal(after, before);
  });

  test("an invalid product is rejected before any write", async () => {
    const result = await captureEvent(baseInput({ product: "NOT_A_PRODUCT" }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 400);
  });
});
