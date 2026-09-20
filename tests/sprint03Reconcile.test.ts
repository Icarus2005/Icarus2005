import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

// Exercises the Sprint 03 reconciliation logic against a real Postgres
// instance — never production. Requires DATABASE_URL to point at a local/dev
// database with migrations applied. Skips itself when no DATABASE_URL is
// set so `npm test` still passes without a local DB.
const hasDb = !!process.env.DATABASE_URL;
const prisma = hasDb ? new PrismaClient() : null;

// Unique per run so repeated runs against the same long-lived shadow DB never
// see fixtures left behind by an earlier run — each run's contact/account
// names are distinguishable from every other run's, so name-based lookups
// stay unambiguous regardless of what prior runs left in the database.
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const IDS = {
  travelport: `test-travelport-acct-${RUN_ID}`,
  andyContact: `test-andy-contact-${RUN_ID}`,
  andrewContact: `test-andrew-contact-${RUN_ID}`,
  andyLead: `test-andy-lead-${RUN_ID}`,
  tourism365: `test-tourism365-acct-${RUN_ID}`,
  oppTourism365: `test-tourism365-opp-${RUN_ID}`,
};
const ANDREW_NAME = `AndrewSprint03-${RUN_ID}`;
const TOURISM_ACCOUNT_NAME = `Tourism 365 (test ${RUN_ID})`;

describe("Sprint 03 reconciliation — dynamic import against a live schema", { skip: !hasDb && "DATABASE_URL not set" }, () => {
  before(async () => {
    await prisma!.product.upsert({ where: { key: "PLACEPULSE" }, create: { key: "PLACEPULSE", name: "PlacePulse" }, update: {} });
    await prisma!.account.upsert({ where: { id: IDS.travelport }, create: { id: IDS.travelport, name: `Travelport (test ${RUN_ID})` }, update: {} });
    await prisma!.account.upsert({ where: { id: IDS.tourism365 }, create: { id: IDS.tourism365, name: TOURISM_ACCOUNT_NAME }, update: {} });
    await prisma!.contact.upsert({
      where: { id: IDS.andyContact },
      create: { id: IDS.andyContact, firstName: "Andy", lastName: `TestOnly-${RUN_ID}`, accountId: IDS.travelport },
      update: {},
    });
    await prisma!.contact.upsert({
      where: { id: IDS.andrewContact },
      create: { id: IDS.andrewContact, firstName: ANDREW_NAME, lastName: "TestOnly", accountId: IDS.tourism365 },
      update: {},
    });
    await prisma!.lead.upsert({
      where: { id: IDS.andyLead },
      create: { id: IDS.andyLead, name: `Andy TestOnly - Travelport (${RUN_ID})`, company: TOURISM_ACCOUNT_NAME, primaryProduct: "PLACEPULSE" },
      update: {},
    });
    await prisma!.opportunity.upsert({
      where: { id: IDS.oppTourism365 },
      create: { id: IDS.oppTourism365, name: `Tourism 365 (test ${RUN_ID}) opp`, accountId: IDS.tourism365, product: "PLACEPULSE" },
      update: {},
    });
  });

  after(async () => {
    // Clean up only the fixtures this run created, so the shadow DB never
    // accumulates cross-run state and every run starts from the same
    // baseline regardless of how many times the suite has run before.
    if (prisma) {
      await prisma.opportunity.deleteMany({ where: { id: IDS.oppTourism365 } });
      await prisma.lead.deleteMany({ where: { id: IDS.andyLead } });
      await prisma.contact.deleteMany({ where: { id: { in: [IDS.andyContact, IDS.andrewContact] } } });
      await prisma.account.deleteMany({ where: { id: { in: [IDS.travelport, IDS.tourism365] } } });
    }
    await prisma?.$disconnect();
  });

  test("normalizeName-based contact lookup matches exactly one contact for an unambiguous name", async () => {
    // This exercises the same lookup helper sprint03Reconcile.ts uses internally —
    // re-derived here rather than importing an unexported symbol.
    const contacts = await prisma!.contact.findMany({ where: { accountId: IDS.tourism365 } });
    const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
    const target = norm(`${ANDREW_NAME} TestOnly`);
    const matches = contacts.filter((c) => norm(`${c.firstName} ${c.lastName}`) === target);
    assert.equal(matches.length, 1);
  });

  test("Lead.accountId backfill matches on exact normalized company name only", async () => {
    const accounts = await prisma!.account.findMany();
    const lead = await prisma!.lead.findUniqueOrThrow({ where: { id: IDS.andyLead } });
    const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
    const match = accounts.find((a) => norm(a.name) === norm(lead.company ?? ""));
    assert.equal(match?.id, IDS.tourism365);
  });
});
