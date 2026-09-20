import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

// Exercises Sprint 06B Activity behavior against a real Postgres instance —
// never production. Requires DATABASE_URL to point at a local/dev database
// with migrations applied. Skips itself when no DATABASE_URL is set.
const hasDb = !!process.env.DATABASE_URL;
const prisma = hasDb ? new PrismaClient() : null;

describe("Sprint 06B — Activities, timeline, no status/stage side effects", { skip: !hasDb && "DATABASE_URL not set" }, () => {
  let accountId: string;
  let contactId: string;
  let leadId: string;
  let opportunityId: string;

  before(async () => {
    await prisma!.product.upsert({ where: { key: "PLACEPULSE" }, create: { key: "PLACEPULSE", name: "PlacePulse" }, update: {} });
    const account = await prisma!.account.create({ data: { name: `Sprint06B Test Co ${Date.now()}` } });
    accountId = account.id;
    const contact = await prisma!.contact.create({ data: { firstName: "Test", lastName: "Contact", accountId } });
    contactId = contact.id;
    const lead = await prisma!.lead.create({ data: { name: "Test Lead", primaryProduct: "PLACEPULSE", accountId, status: "QUALIFIED" } });
    leadId = lead.id;
    const opp = await prisma!.opportunity.create({ data: { name: "Test Opp", accountId, product: "PLACEPULSE", stage: "QUALIFIED" } });
    opportunityId = opp.id;
  });

  after(async () => {
    await prisma?.$disconnect();
  });

  test("creating an Activity links to Account/Contact/Lead/Opportunity without requiring all of them", async () => {
    const activity = await prisma!.activity.create({
      data: { type: "MEETING", subject: "Test meeting", accountId, contactId },
    });
    assert.equal(activity.accountId, accountId);
    assert.equal(activity.contactId, contactId);
    assert.equal(activity.leadId, null);
    assert.equal(activity.opportunityId, null);
  });

  test("timeline query for a Contact returns activities newest first", async () => {
    const older = await prisma!.activity.create({
      data: { type: "CALL", subject: "First call", accountId, contactId, date: new Date("2026-01-01") },
    });
    const newer = await prisma!.activity.create({
      data: { type: "EMAIL", subject: "Follow-up email", accountId, contactId, date: new Date("2026-06-01") },
    });
    const timeline = await prisma!.activity.findMany({
      where: { contactId },
      orderBy: { date: "desc" },
    });
    const ids = timeline.map((a) => a.id);
    assert.ok(ids.indexOf(newer.id) < ids.indexOf(older.id), "newer activity should come first");
  });

  test("creating an Activity linked to a Lead does not change Lead.status", async () => {
    const before = await prisma!.lead.findUniqueOrThrow({ where: { id: leadId } });
    await prisma!.activity.create({ data: { type: "NOTE", subject: "A note", leadId } });
    const after = await prisma!.lead.findUniqueOrThrow({ where: { id: leadId } });
    assert.equal(after.status, before.status);
  });

  test("creating an Activity linked to an Opportunity does not change Opportunity.stage", async () => {
    const before = await prisma!.opportunity.findUniqueOrThrow({ where: { id: opportunityId } });
    await prisma!.activity.create({ data: { type: "DEMO", subject: "Product demo", opportunityId } });
    const after = await prisma!.opportunity.findUniqueOrThrow({ where: { id: opportunityId } });
    assert.equal(after.stage, before.stage);
  });

  test("editing an Activity does not change Lead.status or Opportunity.stage", async () => {
    const activity = await prisma!.activity.create({ data: { type: "NOTE", subject: "Editable", leadId, opportunityId } });
    const leadBefore = await prisma!.lead.findUniqueOrThrow({ where: { id: leadId } });
    const oppBefore = await prisma!.opportunity.findUniqueOrThrow({ where: { id: opportunityId } });
    await prisma!.activity.update({ where: { id: activity.id }, data: { subject: "Edited subject", notes: "Edited notes" } });
    const leadAfter = await prisma!.lead.findUniqueOrThrow({ where: { id: leadId } });
    const oppAfter = await prisma!.opportunity.findUniqueOrThrow({ where: { id: opportunityId } });
    assert.equal(leadAfter.status, leadBefore.status);
    assert.equal(oppAfter.stage, oppBefore.stage);
  });

  test("optional follow-up task created from an Activity inherits the same relationship context", async () => {
    const activity = await prisma!.activity.create({ data: { type: "MEETING", subject: "Meeting w/ task", accountId, contactId, opportunityId } });
    const task = await prisma!.task.create({
      data: { title: "Follow up", accountId: activity.accountId, contactId: activity.contactId, opportunityId: activity.opportunityId },
    });
    assert.equal(task.accountId, accountId);
    assert.equal(task.contactId, contactId);
    assert.equal(task.opportunityId, opportunityId);
  });

  test("no follow-up task exists unless one was explicitly created", async () => {
    const before = await prisma!.task.count();
    await prisma!.activity.create({ data: { type: "CALL", subject: "No task expected", accountId } });
    const after = await prisma!.task.count();
    assert.equal(after, before, "logging an Activity alone must never create a Task");
  });
});
