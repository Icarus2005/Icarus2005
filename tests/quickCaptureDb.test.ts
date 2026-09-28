import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { saveQuickCapture, type QuickSaveInput } from "../src/lib/capture/saveQuick";

const hasDb = Boolean(process.env.DATABASE_URL);

test("LiveX Quick Capture writes known, unknown and existing contacts without duplicate retries", { skip: !hasDb }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const owner = await prisma.teamMember.create({ data: { name: "LiveX Test Owner", email: `livex-${suffix}@example.invalid` } });
  const base: QuickSaveInput = {
    idempotencyKey: randomUUID(), ownerId: owner.id,
    transcript: "I met Ahmed from Example Group at LiveX. He works in partnerships. We discussed PlacePulse. He wants to see the hospitality deck and asked me to follow up Wednesday.",
    eventName: "LiveX Abu Dhabi 2026", eventDate: "2026-09-29", location: "Abu Dhabi, UAE",
    personName: "Ahmed", companyName: `Example Group ${suffix}`, statedRole: "partnerships", productKey: "PLACEPULSE",
    conversationSummary: "Discussed PlacePulse and the hospitality deck.", relationshipContext: "", theirCommitment: "",
    myCommitment: "Send hospitality deck", nextAction: "Send hospitality deck and follow up", dueDate: "2026-09-30",
    notes: "", email: "", phone: "", contactId: "", accountId: "",
  };
  const first = await saveQuickCapture(base);
  assert.ok(first.contactId && first.leadId && first.activityId && first.taskId);
  const activity = await prisma.activity.findUniqueOrThrow({ where: { id: first.activityId } });
  const task = await prisma.task.findUniqueOrThrow({ where: { id: first.taskId! } });
  assert.match(activity.notes || "", /Source: EVENT \| Acquisition: IN_PERSON \| Interaction: MET_PERSONALLY/);
  assert.match(activity.notes || "", /Stated role: partnerships/);
  assert.equal(task.ownerId, owner.id);
  assert.equal(task.dueDate?.toISOString().slice(0, 10), "2026-09-30");
  assert.deepEqual(await saveQuickCapture(base), first);
  assert.equal(await prisma.activity.count({ where: { idempotencyKey: base.idempotencyKey } }), 1);

  const unknown = await saveQuickCapture({ ...base, idempotencyKey: randomUUID(), transcript: "I met someone from ABC. I didn't get his name. Interesting conversation about SalesX. Need to find him on LinkedIn later.", personName: "", companyName: `ABC ${suffix}`, statedRole: "", productKey: "SALESX", conversationSummary: "Discussed SalesX.", myCommitment: "", nextAction: "Identify contact on LinkedIn", dueDate: "" });
  assert.equal(unknown.contactId, null);
  assert.equal(unknown.leadId, null);
  assert.ok(unknown.accountId && unknown.activityId && unknown.taskId);

  const repeat = await saveQuickCapture({ ...base, idempotencyKey: randomUUID(), transcript: "I just met Ahmed again. The proposal is under internal review. Follow up next week.", contactId: first.contactId!, companyName: base.companyName, conversationSummary: "Proposal under internal review.", nextAction: "Follow up next week", dueDate: "2026-10-05" });
  assert.equal(repeat.contactId, first.contactId);
  assert.equal(await prisma.contact.count({ where: { id: first.contactId! } }), 1);
  assert.ok(repeat.activityId && repeat.taskId);
  await prisma.$disconnect();
});
