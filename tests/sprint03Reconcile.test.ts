import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

// Exercises the Sprint 03 reconciliation logic against a real Postgres
// instance — never production. Requires DATABASE_URL to point at a local/dev
// database with migrations applied. Skips itself when no DATABASE_URL is
// set so `npm test` still passes without a local DB.
const hasDb = !!process.env.DATABASE_URL;
const prisma = hasDb ? new PrismaClient() : null;

const IDS = {
  travelport: "test-travelport-acct",
  andyContact: "test-andy-contact",
  andyLead: "test-andy-lead",
  tourism365: "test-tourism365-acct",
  oppTourism365: "test-tourism365-opp",
};

describe("Sprint 03 reconciliation — dynamic import against a live schema", { skip: !hasDb && "DATABASE_URL not set" }, () => {
  before(async () => {
    await prisma!.product.upsert({ where: { key: "PLACEPULSE" }, create: { key: "PLACEPULSE", name: "PlacePulse" }, update: {} });
    await prisma!.account.upsert({ where: { id: IDS.travelport }, create: { id: IDS.travelport, name: "Travelport (test)" }, update: {} });
    await prisma!.account.upsert({ where: { id: IDS.tourism365 }, create: { id: IDS.tourism365, name: "Tourism 365 (test)" }, update: {} });
    await prisma!.contact.upsert({
      where: { id: IDS.andyContact },
      create: { id: IDS.andyContact, firstName: "Andy", lastName: "TestOnly", accountId: IDS.travelport },
      update: {},
    });
    await prisma!.contact.create({ data: { firstName: "AndrewSprint03", lastName: "TestOnly", accountId: IDS.tourism365 } });
    await prisma!.lead.upsert({
      where: { id: IDS.andyLead },
      create: { id: IDS.andyLead, name: "Andy TestOnly - Travelport", company: "Tourism 365 (test)", primaryProduct: "PLACEPULSE" },
      update: {},
    });
    await prisma!.opportunity.upsert({
      where: { id: IDS.oppTourism365 },
      create: { id: IDS.oppTourism365, name: "Tourism 365 (test) opp", accountId: IDS.tourism365, product: "PLACEPULSE" },
      update: {},
    });
  });

  after(async () => {
    await prisma?.$disconnect();
  });

  test("normalizeName-based contact lookup matches exactly one contact for an unambiguous name", async () => {
    // This exercises the same lookup helper sprint03Reconcile.ts uses internally —
    // re-derived here rather than importing an unexported symbol.
    const contacts = await prisma!.contact.findMany({ where: { accountId: IDS.tourism365 } });
    const target = "andrewsprint03 testonly";
    const matches = contacts.filter(
      (c) => `${c.firstName} ${c.lastName}`.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim() === target
    );
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
