import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { actualDate, followupDate, money, parseImport } from "../src/lib/fundraising/rules";
import { importProspects, logEvent, reconcileDelivery, sendFundraisingEmail, updateProspect } from "../src/lib/fundraising/service";
import type { EmailProvider } from "../src/lib/email/provider";

const row = (sourceKey = randomUUID()) => ({ sourceKey, name: "Synthetic Investor", routeType: "Direct fund", priority: "Now", status: "NOT_STARTED", sourceStatus: "Not started", nextAction: "Review fit", notes: "Synthetic test only", evidence: "Fixture", source: "Synthetic fixture", drafts: [{ id: "TEST", subject: "Introduction", body: "Synthetic fundraising draft.", channel: "Email", condition: "Review first" }] });
test("business-day follow-ups cross weekends and the Dubai midnight boundary", () => {
  assert.equal(followupDate(new Date("2026-11-17T08:00:00Z"), 5).toISOString(), "2026-11-24T05:00:00.000Z");
  assert.equal(followupDate(new Date("2026-11-17T08:00:00Z"), 10).toISOString(), "2026-12-01T05:00:00.000Z");
  assert.equal(followupDate(new Date("2026-11-19T22:00:00Z"), 1).toISOString(), "2026-11-23T05:00:00.000Z");
});
test("imports cannot invent sends, investments, or duplicate source rows", () => {
  assert.throws(() => parseImport([{ ...row(), status: "CONTACTED" }]));
  assert.throws(() => parseImport([{ ...row(), status: "COMMITTED" }]));
  const r = row(); assert.throws(() => parseImport([r, r]));
  assert.equal(parseImport([r])[0].status, "NOT_STARTED");
  assert.throws(() => money(-1)); assert.throws(() => money("300")); assert.throws(() => money(0.001));
  assert.throws(() => actualDate("2026-11-17T10:00"));
  assert.throws(() => actualDate("2099-01-01T00:00:00Z"));
});

// Explicitly local, disposable Postgres only. Providers are always fakes.
const url = process.env.DATABASE_URL;
const safeDb = !!url && /^(localhost|127\.0\.0\.1)$/.test(new URL(url).hostname) && new URL(url).pathname.includes("disposable");
describe("fundraising workflow against disposable Postgres", { skip: !safeDb }, () => {
  const ids: string[] = [];
  const accountIds: string[] = [];
  async function make(link = false) {
    const r = row(); await importProspects([r], false);
    const p = await prisma.fundraisingProspect.findFirstOrThrow({ where: { sourceKey: r.sourceKey } }); ids.push(p.id);
    if (link) {
      const account = await prisma.account.create({ data: { name: `Synthetic fund ${randomUUID()}` } }); accountIds.push(account.id);
      const contact = await prisma.contact.create({ data: { firstName: "Synthetic", lastName: "Investor", email: `${randomUUID()}@example.test`, accountId: account.id } });
      return prisma.fundraisingProspect.update({ where: { id:p.id }, data: { contactId:contact.id }, include: { contact:true } });
    }
    return { ...p, contact: null };
  }
  function event(extra = {}) { return { action:"LOG_SENT", key:randomUUID(), at:"2026-11-17T08:00:00Z", channel:"EMAIL", subject:"Synthetic introduction", body:"Synthetic message", kind:"INITIAL", confirmed:true, ...extra }; }
  function send(to: string, extra = {}) { return { key:randomUUID(), approved:true, conditionsConfirmed:true, kind:"INITIAL", subject:"Synthetic introduction", body:"Synthetic message", to, ...extra }; }
  function fake(onSend = async () => {}) { let calls = 0; return { get calls() { return calls; }, async sendEmail() { calls++; await onSend(); return { providerMessageId:"synthetic-id" }; } } satisfies EmailProvider & {calls:number}; }
  after(async () => {
    await prisma.fundraisingDispatch.deleteMany({ where: { prospectId: { in:ids } } });
    await prisma.activity.deleteMany({ where: { fundraisingProspectId: { in:ids } } });
    await prisma.task.deleteMany({ where: { fundraisingProspectId: { in:ids } } });
    await prisma.fundraisingProspect.deleteMany({ where: { id: { in:ids } } });
    await prisma.account.deleteMany({ where: { id: { in:accountIds } } });
    await prisma.$disconnect();
  });
  test("preview writes nothing; repeated imports preserve edits and create no tasks or activities", async () => {
    const r = row(); const before = await prisma.fundraisingProspect.count();
    const preview = await importProspects([r], true); assert.ok(Array.isArray(preview));
    assert.equal(await prisma.fundraisingProspect.count(), before);
    await Promise.all([importProspects([r],false),importProspects([r],false)]);
    const p = await prisma.fundraisingProspect.findFirstOrThrow({ where:{sourceKey:r.sourceKey} }); ids.push(p.id);
    await prisma.fundraisingProspect.update({where:{id:p.id},data:{notes:"Human edit"}});
    assert.deepEqual(await importProspects([r],false),{count:0});
    assert.equal((await prisma.fundraisingProspect.findUniqueOrThrow({where:{id:p.id}})).notes,"Human edit");
    assert.equal(await prisma.task.count({where:{fundraisingProspectId:p.id}}),0);
    assert.equal(await prisma.activity.count({where:{fundraisingProspectId:p.id}}),0);
    assert.equal(p.firstSentAt,null); assert.equal(Number(p.committedUsd),0);
  });
  test("confirmed send creates two canonical tasks once; reply closes them without touching unrelated tasks", async () => {
    const p = await make(); const input = event();
    const unrelated = await prisma.task.create({data:{title:"Unrelated relationship task",fundraisingProspectId:p.id}});
    await Promise.all([logEvent(p.id,input),logEvent(p.id,input)]);
    assert.equal(await prisma.activity.count({where:{fundraisingProspectId:p.id}}),1);
    const tasks = await prisma.task.findMany({where:{fundraisingProspectId:p.id},orderBy:{dueDate:"asc"}});
    assert.equal(tasks.length,3);
    assert.ok(tasks.some(t => t.dueDate?.toISOString() === "2026-11-24T05:00:00.000Z"));
    await logEvent(p.id,event({action:"REPLY",subject:"Reply",at:"2026-11-18T08:00:00Z"}));
    const open = await prisma.task.findMany({where:{fundraisingProspectId:p.id,status:"OPEN"}});
    assert.deepEqual(open.map(t=>t.id),[unrelated.id]);
    await assert.rejects(logEvent(p.id,event({kind:"FOLLOWUP_1"})),/unanswered sequence/);
  });
  test("sequence advances only on real sends, then pauses after the final follow-up", async () => {
    const p = await make(); await logEvent(p.id,event());
    await assert.rejects(logEvent(p.id,event({kind:"FOLLOWUP_2"})),/first follow-up/);
    await logEvent(p.id,event({kind:"FOLLOWUP_1",at:"2026-11-18T07:00:00Z"}));
    assert.equal(await prisma.task.count({where:{fundraisingProspectId:p.id,status:"OPEN"}}),1);
    await logEvent(p.id,event({kind:"FOLLOWUP_2",at:"2026-11-18T08:00:00Z"}));
    assert.equal((await prisma.fundraisingProspect.findUniqueOrThrow({where:{id:p.id}})).status,"PAUSED");
    assert.equal(await prisma.task.count({where:{fundraisingProspectId:p.id,status:"OPEN"}}),0);
  });
  test("approval and recipient gates reject before calling the provider", async () => {
    const p = await make(true); const provider = fake();
    await assert.rejects(sendFundraisingEmail(p.id,send(p.contact!.email!,{approved:false}),provider),/Review/);
    await assert.rejects(sendFundraisingEmail(p.id,send("wrong@example.test"),provider),/match/);
    await assert.rejects(sendFundraisingEmail(p.id,send(p.contact!.email!),null),/not configured/);
    assert.equal(provider.calls,0);
  });
  test("successful provider replay sends once and does not duplicate CRM activity or tasks", async () => {
    const p = await make(true); const provider = fake(); const input = send(p.contact!.email!);
    await sendFundraisingEmail(p.id,input,provider); await sendFundraisingEmail(p.id,input,provider);
    assert.equal(provider.calls,1);
    assert.equal(await prisma.activity.count({where:{fundraisingProspectId:p.id}}),1);
    assert.equal(await prisma.task.count({where:{fundraisingProspectId:p.id}}),2);
    await assert.rejects(sendFundraisingEmail(p.id,{...input,body:"Different content"},provider),/different content/);
  });
  test("concurrent different approval keys cannot send twice to one route", async () => {
    const p = await make(true); let release!:()=>void;
    const gate = new Promise<void>(r=>{release=r}); const provider = fake(()=>gate);
    const first = sendFundraisingEmail(p.id,send(p.contact!.email!),provider);
    while (!provider.calls) await new Promise(r=>setTimeout(r,10));
    await assert.rejects(sendFundraisingEmail(p.id,send(p.contact!.email!),provider),/unresolved/);
    release(); await first; assert.equal(provider.calls,1);
  });
  test("uncertain send blocks retries until verified reconciliation; no tasks are invented on failure", async () => {
    const p = await make(true); const provider = fake(async()=>{throw new Error("Timeout")}); const input = send(p.contact!.email!);
    await assert.rejects(sendFundraisingEmail(p.id,input,provider),/uncertain/);
    await assert.rejects(sendFundraisingEmail(p.id,input,provider),/uncertain/);
    assert.equal(provider.calls,1); assert.equal(await prisma.task.count({where:{fundraisingProspectId:p.id}}),0);
    await assert.rejects(reconcileDelivery(p.id,{dispatchId:input.key,outcome:"SENT",evidence:"Checked Sent",at:new Date().toISOString()}),/ten minutes/);
    await prisma.fundraisingDispatch.update({where:{id:input.key},data:{createdAt:new Date(Date.now()-11*60_000)}});
    await reconcileDelivery(p.id,{dispatchId:input.key,outcome:"SENT",evidence:"Provider Sent folder confirms delivery",at:new Date().toISOString()});
    assert.equal(await prisma.task.count({where:{fundraisingProspectId:p.id}}),2);
    await assert.rejects(reconcileDelivery(p.id,{dispatchId:input.key,outcome:"SENT",evidence:"Checked Sent",at:new Date().toISOString()}),/No unresolved/);
  });
  test("reply during provider call remains stopped after the provider returns", async () => {
    const p = await make(true);
    const provider = fake(async()=>{ await logEvent(p.id,event({action:"REPLY",at:new Date().toISOString(),subject:"Investor replied"})); });
    await sendFundraisingEmail(p.id,send(p.contact!.email!),provider);
    assert.equal((await prisma.fundraisingProspect.findUniqueOrThrow({where:{id:p.id}})).status,"REPLIED");
    assert.equal(await prisma.task.count({where:{fundraisingProspectId:p.id,status:"OPEN"}}),0);
  });
  test("capital evidence is required and fundraising never creates commercial opportunities", async () => {
    const p = await make(); const opportunities = await prisma.opportunity.count();
    const input = {...p,drafts:row().drafts,committedUsd:50000,receivedUsd:0,capitalEvidence:""};
    await assert.rejects(updateProspect(p.id,input),/evidence/);
    await updateProspect(p.id,{...input,status:"COMMITTED",capitalEvidence:"Dated synthetic signed confirmation"});
    assert.equal(await prisma.opportunity.count(),opportunities);
    await assert.rejects(updateProspect(p.id,{...input,receivedUsd:60000}),/exceed/);
  });
  test("subsequent responses keep a replied conversation stopped", async () => {
    const p = await make(); await logEvent(p.id,event());
    await logEvent(p.id,event({action:"REPLY",at:"2026-11-18T07:00:00Z",subject:"Investor reply"}));
    await logEvent(p.id,event({kind:"RESPONSE",at:"2026-11-18T08:00:00Z",subject:"Requested information"}));
    assert.equal((await prisma.fundraisingProspect.findUniqueOrThrow({where:{id:p.id}})).status,"REPLIED");
    assert.equal(await prisma.task.count({where:{fundraisingProspectId:p.id,status:"OPEN"}}),0);
  });
  test("hold routes cannot send, and existing submissions cannot start a duplicate new email thread", async () => {
    const p = await make(true); const provider = fake();
    await prisma.fundraisingProspect.update({where:{id:p.id},data:{priority:"Hold",status:"HOLD"}});
    await assert.rejects(sendFundraisingEmail(p.id,send(p.contact!.email!),provider),/stopped/);
    await prisma.fundraisingProspect.update({where:{id:p.id},data:{priority:"Now",status:"SUBMITTED_PREVIOUSLY",sourceStatus:"Submitted previously"}});
    await assert.rejects(sendFundraisingEmail(p.id,send(p.contact!.email!),provider),/original submission thread/);
    assert.equal(provider.calls,0);
  });
});
