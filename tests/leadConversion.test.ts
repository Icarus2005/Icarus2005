import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import {
  convertLeadToOpportunity,
  LeadConversionError,
} from "../src/lib/leadConversion";

const hasDb = !!process.env.DATABASE_URL;
const prisma = hasDb ? new PrismaClient() : null;
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const leadIds = new Set<string>();
const accountIds = new Set<string>();

async function seedPipeline(productKey: "PLACEPULSE" | "ADVISORY", pipelineId: string) {
  await prisma!.product.upsert({
    where: { key: productKey },
    create: { key: productKey, name: productKey },
    update: {},
  });
  await prisma!.pipeline.upsert({
    where: { id: pipelineId },
    create: { id: pipelineId, name: `${productKey} Test`, productKey, active: true },
    update: { active: true },
  });
  await prisma!.pipelineStage.upsert({
    where: { id: `st_${pipelineId}_identified` },
    create: {
      id: `st_${pipelineId}_identified`,
      key: "IDENTIFIED",
      name: "Identified",
      order: 0,
      defaultProbability: 5,
      pipelineId,
    },
    update: { active: true, isWon: false, isLost: false },
  });
}

describe("Commercial Maturity — transactional Lead conversion", { skip: !hasDb && "DATABASE_URL not set" }, () => {
  before(async () => {
    await seedPipeline("PLACEPULSE", "pl_placepulse");
    await seedPipeline("ADVISORY", "pl_advisory");
  });

  after(async () => {
    if (!prisma) return;
    await prisma.pipeline.updateMany({ where: { productKey: "ADVISORY" }, data: { active: true } });
    const leads = Array.from(leadIds);
    const accounts = Array.from(accountIds);
    await prisma.task.deleteMany({ where: { OR: [{ leadId: { in: leads } }, { accountId: { in: accounts } }] } });
    await prisma.activity.deleteMany({ where: { OR: [{ leadId: { in: leads } }, { accountId: { in: accounts } }] } });
    await prisma.lead.deleteMany({ where: { id: { in: leads } } });
    await prisma.opportunity.deleteMany({ where: { accountId: { in: accounts } } });
    await prisma.contact.deleteMany({ where: { accountId: { in: accounts } } });
    await prisma.account.deleteMany({ where: { id: { in: accounts } } });
    await prisma.$disconnect();
  });

  test("reuses linked Account and primary Contact, carries the open Task, and marks the Opportunity contact primary", async () => {
    const account = await prisma!.account.create({ data: { name: `Existing Account ${runId}` } });
    accountIds.add(account.id);
    const contact = await prisma!.contact.create({
      data: {
        firstName: "Existing",
        lastName: "Contact",
        email: `existing-${runId}@example.com`,
        accountId: account.id,
      },
    });
    const lead = await prisma!.lead.create({
      data: {
        name: "Existing Contact",
        company: account.name,
        email: contact.email,
        primaryProduct: "PLACEPULSE",
        accountId: account.id,
        primaryContactId: contact.id,
      },
    });
    leadIds.add(lead.id);
    const task = await prisma!.task.create({
      data: { title: "Review scope", status: "OPEN", leadId: lead.id },
    });

    const result = await convertLeadToOpportunity(lead.id, {}, prisma!);
    assert.equal(result.replay, false);
    assert.equal(result.accountId, account.id);
    assert.equal(result.contactId, contact.id);
    assert.equal(result.taskId, task.id);

    const stakeholder = await prisma!.opportunityContact.findUniqueOrThrow({
      where: { opportunityId_contactId: { opportunityId: result.opportunityId, contactId: contact.id } },
    });
    assert.equal(stakeholder.isPrimary, true);
    const carriedTask = await prisma!.task.findUniqueOrThrow({ where: { id: task.id } });
    assert.equal(carriedTask.opportunityId, result.opportunityId);
    assert.equal(carriedTask.accountId, account.id);
    assert.equal(carriedTask.contactId, contact.id);
    const convertedLead = await prisma!.lead.findUniqueOrThrow({ where: { id: lead.id } });
    assert.equal(convertedLead.convertedOpportunityId, result.opportunityId);
    assert.equal(convertedLead.status, "QUALIFIED");

    const replay = await convertLeadToOpportunity(lead.id, {}, prisma!);
    assert.equal(replay.replay, true);
    assert.equal(replay.opportunityId, result.opportunityId);
    assert.equal(replay.taskId, task.id);
    assert.equal(await prisma!.opportunity.count({ where: { accountId: account.id } }), 1);
  });

  test("two simultaneous conversion requests converge on one Opportunity, Contact, Account, and Task", async () => {
    const company = `Concurrent Account ${runId}`;
    const lead = await prisma!.lead.create({
      data: {
        name: "Concurrent Person",
        company,
        email: `concurrent-${runId}@example.com`,
        primaryProduct: "PLACEPULSE",
        nextAction: "Book discovery call",
      },
    });
    leadIds.add(lead.id);

    const [first, second] = await Promise.all([
      convertLeadToOpportunity(lead.id, {}, prisma!),
      convertLeadToOpportunity(lead.id, {}, prisma!),
    ]);
    assert.equal(first.opportunityId, second.opportunityId);
    assert.equal(first.accountId, second.accountId);
    assert.equal(first.contactId, second.contactId);
    assert.equal(first.taskId, second.taskId);
    assert.deepEqual(new Set([first.replay, second.replay]), new Set([false, true]));
    accountIds.add(first.accountId);
    assert.equal(await prisma!.account.count({ where: { name: company } }), 1);
    assert.equal(await prisma!.contact.count({ where: { accountId: first.accountId } }), 1);
    assert.equal(await prisma!.opportunity.count({ where: { accountId: first.accountId } }), 1);
    assert.equal(await prisma!.task.count({ where: { opportunityId: first.opportunityId, status: "OPEN" } }), 1);
  });

  test("creates a canonical Task from the reviewed next action when no open Task exists", async () => {
    const lead = await prisma!.lead.create({
      data: {
        name: "Task Person",
        company: `Task Account ${runId}`,
        primaryProduct: "PLACEPULSE",
      },
    });
    leadIds.add(lead.id);
    const result = await convertLeadToOpportunity(
      lead.id,
      { nextTaskTitle: "Send qualification brief", nextTaskDueDate: "2026-11-10" },
      prisma!
    );
    accountIds.add(result.accountId);
    const task = await prisma!.task.findUniqueOrThrow({ where: { id: result.taskId } });
    assert.equal(task.title, "Send qualification brief");
    assert.equal(task.leadId, lead.id);
    assert.equal(task.opportunityId, result.opportunityId);
    assert.equal(task.accountId, result.accountId);
    assert.equal(task.contactId, result.contactId);
    assert.equal(task.product, "PLACEPULSE");
  });

  test("rolls back Account, Contact, primary Opportunity, and Lead changes when a secondary pipeline fails", async () => {
    const company = `Rollback Account ${runId}`;
    const lead = await prisma!.lead.create({
      data: {
        name: "Rollback Person",
        company,
        primaryProduct: "PLACEPULSE",
        secondaryProducts: "ADVISORY",
        nextAction: "Confirm next step",
      },
    });
    leadIds.add(lead.id);
    await prisma!.pipeline.updateMany({ where: { productKey: "ADVISORY" }, data: { active: false } });
    try {
      await assert.rejects(
        convertLeadToOpportunity(lead.id, { secondaries: [{ product: "ADVISORY" }] }, prisma!),
        (error: unknown) => error instanceof LeadConversionError && error.status === 409
      );
      assert.equal(await prisma!.account.count({ where: { name: company } }), 0);
      assert.equal(await prisma!.contact.count({ where: { firstName: "Rollback", lastName: "Person" } }), 0);
      const unchanged = await prisma!.lead.findUniqueOrThrow({ where: { id: lead.id } });
      assert.equal(unchanged.convertedOpportunityId, null);
      assert.equal(unchanged.accountId, null);
      assert.equal(unchanged.primaryContactId, null);
    } finally {
      await prisma!.pipeline.updateMany({ where: { productKey: "ADVISORY" }, data: { active: true } });
    }
  });

  test("refuses conversion without an open or reviewed next Task and writes nothing", async () => {
    const company = `No Task Account ${runId}`;
    const lead = await prisma!.lead.create({
      data: { name: "No Task Person", company, primaryProduct: "PLACEPULSE" },
    });
    leadIds.add(lead.id);
    await assert.rejects(
      convertLeadToOpportunity(lead.id, {}, prisma!),
      (error: unknown) => error instanceof LeadConversionError && error.status === 400
    );
    assert.equal(await prisma!.account.count({ where: { name: company } }), 0);
    assert.equal(await prisma!.opportunity.count({ where: { name: { contains: company } } }), 0);
  });
});
