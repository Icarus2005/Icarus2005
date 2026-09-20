import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

// Exercises Sprint 06C Sales Copilot behavior against a real Postgres
// instance — never production. Requires DATABASE_URL. Skips itself
// otherwise. Never makes a live LLM call: ANTHROPIC_API_KEY is forced unset
// for this file so runNextAction/runDraftEmail/runMeetingObjective always
// take the deterministic template fallback path, regardless of what's
// configured in the surrounding environment.
delete process.env.ANTHROPIC_API_KEY;

const hasDb = !!process.env.DATABASE_URL;
const prisma = hasDb ? new PrismaClient() : null;

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe("Sprint 06C — Sales Copilot", { skip: !hasDb && "DATABASE_URL not set" }, () => {
  let accountId: string;
  let contactId: string;
  let leadId: string;
  let opportunityId: string;
  let unrelatedAccountId: string;
  let unrelatedLeadId: string;
  let bareLeadId: string;

  before(async () => {
    await prisma!.product.upsert({ where: { key: "PLACEPULSE" }, create: { key: "PLACEPULSE", name: "PlacePulse" }, update: {} });

    const account = await prisma!.account.create({ data: { name: `Copilot Test Co ${RUN_ID}` } });
    accountId = account.id;
    const contact = await prisma!.contact.create({
      data: {
        firstName: "Roger",
        lastName: `TestOnly-${RUN_ID}`,
        title: "CX Director",
        accountId,
        relationshipStrength: "ENGAGED",
        sourceType: "EVENT",
        sourceDetail: "ATM Dubai 2026",
      },
    });
    contactId = contact.id;
    const lead = await prisma!.lead.create({
      data: { name: `Roger TestOnly ${RUN_ID}`, primaryProduct: "PLACEPULSE", accountId, primaryContactId: contactId, status: "QUALIFIED" },
    });
    leadId = lead.id;
    const opp = await prisma!.opportunity.create({ data: { name: `Copilot Test Opp ${RUN_ID}`, accountId, product: "PLACEPULSE", stage: "QUALIFIED" } });
    opportunityId = opp.id;
    await prisma!.opportunityContact.create({ data: { opportunityId, contactId, isPrimary: true } });
    await prisma!.activity.create({
      data: { type: "MEETING", subject: "ATM booth conversation", notes: "Discussed Aquaventure CX needs", date: new Date(), leadId, accountId, contactId },
    });
    await prisma!.task.create({ data: { title: "Send follow-up deck", status: "OPEN", leadId, accountId } });

    // An unrelated account/lead with its own activity — used to prove the
    // context builder never leaks another client's data into this one's.
    const unrelatedAccount = await prisma!.account.create({ data: { name: `Unrelated Co ${RUN_ID}` } });
    unrelatedAccountId = unrelatedAccount.id;
    const unrelatedLead = await prisma!.lead.create({ data: { name: `Unrelated Lead ${RUN_ID}`, primaryProduct: "AI_NAVIGATOR", accountId: unrelatedAccountId, status: "NEW" } });
    unrelatedLeadId = unrelatedLead.id;
    await prisma!.activity.create({ data: { type: "CALL", subject: "SECRET_UNRELATED_ACTIVITY", date: new Date(), leadId: unrelatedLeadId, accountId: unrelatedAccountId } });

    // A bare lead with no activities/tasks/account/contact — exercises the
    // "missing context handled safely" path.
    const bareLead = await prisma!.lead.create({ data: { name: `Bare Lead ${RUN_ID}`, primaryProduct: "UNASSIGNED", status: "NEW" } });
    bareLeadId = bareLead.id;
  });

  after(async () => {
    if (prisma) {
      await prisma.task.deleteMany({ where: { leadId: { in: [leadId] } } });
      await prisma.activity.deleteMany({ where: { leadId: { in: [leadId, unrelatedLeadId] } } });
      await prisma.opportunityContact.deleteMany({ where: { opportunityId } });
      await prisma.opportunity.deleteMany({ where: { id: opportunityId } });
      await prisma.lead.deleteMany({ where: { id: { in: [leadId, unrelatedLeadId, bareLeadId] } } });
      await prisma.contact.deleteMany({ where: { id: contactId } });
      await prisma.account.deleteMany({ where: { id: { in: [accountId, unrelatedAccountId] } } });
    }
    await prisma?.$disconnect();
  });

  test("context builder selects correct entity data for a Lead", async () => {
    const { buildSalesContext } = await import("../src/lib/salesCopilot/context");
    const ctx = await buildSalesContext("LEAD", leadId);
    assert.ok(ctx);
    assert.equal(ctx!.entityType, "LEAD");
    assert.equal(ctx!.accountName, `Copilot Test Co ${RUN_ID}`);
    assert.equal(ctx!.contactName, `Roger TestOnly-${RUN_ID}`);
    assert.equal(ctx!.leadStatus, "Qualified");
    assert.equal(ctx!.recentActivities.length, 1);
    assert.equal(ctx!.recentActivities[0].subject, "ATM booth conversation");
    assert.equal(ctx!.openTasks.length, 1);
    assert.equal(ctx!.openTasks[0].title, "Send follow-up deck");
  });

  test("context builder selects correct entity data for a Contact", async () => {
    const { buildSalesContext } = await import("../src/lib/salesCopilot/context");
    const ctx = await buildSalesContext("CONTACT", contactId);
    assert.ok(ctx);
    assert.equal(ctx!.entityType, "CONTACT");
    assert.equal(ctx!.relationshipStrength, "Engaged");
    assert.equal(ctx!.sourceDetail, "ATM Dubai 2026");
  });

  test("context builder selects correct entity data for an Opportunity", async () => {
    const { buildSalesContext } = await import("../src/lib/salesCopilot/context");
    const ctx = await buildSalesContext("OPPORTUNITY", opportunityId);
    assert.ok(ctx);
    assert.equal(ctx!.entityType, "OPPORTUNITY");
    assert.equal(ctx!.opportunityStage, "QUALIFIED");
    assert.equal(ctx!.primaryContactName, `Roger TestOnly-${RUN_ID}`);
  });

  test("unrelated records are excluded from another entity's context", async () => {
    const { buildSalesContext } = await import("../src/lib/salesCopilot/context");
    const ctx = await buildSalesContext("LEAD", leadId);
    assert.ok(ctx);
    const subjects = ctx!.recentActivities.map((a) => a.subject);
    assert.ok(!subjects.includes("SECRET_UNRELATED_ACTIVITY"));
    assert.ok(!ctx!.accountName?.includes("Unrelated"));
  });

  test("missing context (no account/contact/activities/tasks) is handled safely, not fabricated", async () => {
    const { buildSalesContext } = await import("../src/lib/salesCopilot/context");
    const ctx = await buildSalesContext("LEAD", bareLeadId);
    assert.ok(ctx);
    assert.equal(ctx!.accountName, null);
    assert.equal(ctx!.recentActivities.length, 0);
    assert.equal(ctx!.openTasks.length, 0);
    assert.equal(ctx!.lastInteractionSummary, null);
  });

  test("nonexistent entity returns null rather than fabricated context", async () => {
    const { buildSalesContext } = await import("../src/lib/salesCopilot/context");
    const ctx = await buildSalesContext("LEAD", "does-not-exist");
    assert.equal(ctx, null);
  });

  test("NEXT_ACTION returns a structured result via template fallback (no live LLM call)", async () => {
    const { buildSalesContext } = await import("../src/lib/salesCopilot/context");
    const { runNextAction } = await import("../src/lib/salesCopilot/prompt");
    const ctx = await buildSalesContext("LEAD", leadId);
    const result = await runNextAction(ctx!);
    assert.equal(typeof result.recommendedAction, "string");
    assert.equal(typeof result.why, "string");
    assert.equal(typeof result.objective, "string");
    assert.equal(typeof result.timing, "string");
  });

  test("DRAFT_EMAIL returns a structured result and flags missing context when there's nothing to reference", async () => {
    const { buildSalesContext } = await import("../src/lib/salesCopilot/context");
    const { runDraftEmail } = await import("../src/lib/salesCopilot/prompt");
    const ctx = await buildSalesContext("LEAD", bareLeadId);
    const result = await runDraftEmail(ctx!);
    assert.equal(typeof result.subject, "string");
    assert.equal(typeof result.body, "string");
    assert.ok(result.missingContext, "should flag missing context rather than fabricate a grounded draft");
  });

  test("MEETING_OBJECTIVE returns a structured result", async () => {
    const { buildSalesContext } = await import("../src/lib/salesCopilot/context");
    const { runMeetingObjective } = await import("../src/lib/salesCopilot/prompt");
    const ctx = await buildSalesContext("OPPORTUNITY", opportunityId);
    const result = await runMeetingObjective(ctx!);
    assert.equal(typeof result.objective, "string");
    assert.ok(Array.isArray(result.questions));
    assert.ok(result.questions.length >= 3);
  });

  test("running all three Copilot actions never writes to the CRM", async () => {
    const { buildSalesContext } = await import("../src/lib/salesCopilot/context");
    const { runNextAction, runDraftEmail, runMeetingObjective } = await import("../src/lib/salesCopilot/prompt");
    const before = await prisma!.lead.findUniqueOrThrow({ where: { id: leadId } });
    const oppBefore = await prisma!.opportunity.findUniqueOrThrow({ where: { id: opportunityId } });
    const taskCountBefore = await prisma!.task.count({ where: { leadId } });
    const activityCountBefore = await prisma!.activity.count({ where: { leadId } });

    const ctx = await buildSalesContext("LEAD", leadId);
    await runNextAction(ctx!);
    await runDraftEmail(ctx!);
    await runMeetingObjective(ctx!);

    const after = await prisma!.lead.findUniqueOrThrow({ where: { id: leadId } });
    const oppAfter = await prisma!.opportunity.findUniqueOrThrow({ where: { id: opportunityId } });
    assert.equal(after.status, before.status);
    assert.equal(oppAfter.stage, oppBefore.stage);
    assert.equal(await prisma!.task.count({ where: { leadId } }), taskCountBefore);
    assert.equal(await prisma!.activity.count({ where: { leadId } }), activityCountBefore);
  });
});

describe("Sales Copilot — pure validation (no DB required)", () => {
  test("isSalesCopilotEntityType accepts only LEAD/CONTACT/OPPORTUNITY", async () => {
    const { isSalesCopilotEntityType } = await import("../src/lib/salesCopilot/context");
    assert.equal(isSalesCopilotEntityType("LEAD"), true);
    assert.equal(isSalesCopilotEntityType("CONTACT"), true);
    assert.equal(isSalesCopilotEntityType("OPPORTUNITY"), true);
    assert.equal(isSalesCopilotEntityType("ACCOUNT"), false);
    assert.equal(isSalesCopilotEntityType("lead"), false);
    assert.equal(isSalesCopilotEntityType(123), false);
    assert.equal(isSalesCopilotEntityType(undefined), false);
  });

  test("isSalesCopilotAction accepts only the three supported actions", async () => {
    const { isSalesCopilotAction } = await import("../src/lib/salesCopilot/prompt");
    assert.equal(isSalesCopilotAction("NEXT_ACTION"), true);
    assert.equal(isSalesCopilotAction("DRAFT_EMAIL"), true);
    assert.equal(isSalesCopilotAction("MEETING_OBJECTIVE"), true);
    assert.equal(isSalesCopilotAction("SEND_EMAIL"), false);
    assert.equal(isSalesCopilotAction("ANYTHING"), false);
    assert.equal(isSalesCopilotAction(null), false);
  });
});
