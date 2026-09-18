import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

// Exercises the Sprint 01 foundation relations (Lead.account/primaryContact,
// Contact.referredBy, OpportunityContact.isPrimary, AccountProduct) against a
// real Postgres instance — never production. Requires DATABASE_URL to point
// at a local/dev database with migrations applied
// (`npx prisma migrate deploy`). Skips itself when no DATABASE_URL is set so
// `npm test` still passes in environments without a local DB.
const hasDb = !!process.env.DATABASE_URL;
const prisma = hasDb ? new PrismaClient() : null;

describe("Foundation cleanup sprint 01 — schema relations", { skip: !hasDb && "DATABASE_URL not set" }, () => {
  before(async () => {
    await prisma!.product.upsert({
      where: { key: "PLACEPULSE" },
      create: { key: "PLACEPULSE", name: "PlacePulse" },
      update: {},
    });
  });

  after(async () => {
    await prisma?.$disconnect();
  });

  test("Lead links to Account and a primary Contact", async () => {
    const account = await prisma!.account.create({ data: { name: `Test Co ${Date.now()}` } });
    const contact = await prisma!.contact.create({
      data: { firstName: "Ada", lastName: "Lovelace", accountId: account.id },
    });
    const lead = await prisma!.lead.create({
      data: { name: "Ada Lovelace", primaryProduct: "PLACEPULSE", accountId: account.id, primaryContactId: contact.id },
    });

    const fetched = await prisma!.lead.findUniqueOrThrow({
      where: { id: lead.id },
      include: { account: true, primaryContact: true },
    });
    assert.equal(fetched.account?.id, account.id);
    assert.equal(fetched.primaryContact?.id, contact.id);
  });

  test("Contact.referredBy supports a multi-hop referral chain (Andrew -> Rebin -> Yara shape)", async () => {
    const account = await prisma!.account.create({ data: { name: `Referral Co ${Date.now()}` } });
    const andrew = await prisma!.contact.create({ data: { firstName: "Andrew", lastName: "Gaied", accountId: account.id } });
    const rebin = await prisma!.contact.create({
      data: { firstName: "Rebin", lastName: "Baby", accountId: account.id, referredById: andrew.id, acquisitionPath: "INTERNAL_REFERRAL" },
    });
    const yara = await prisma!.contact.create({
      data: { firstName: "Yara", lastName: "El Dehni", accountId: account.id, referredById: rebin.id, acquisitionPath: "INTRODUCTION" },
    });

    const chain = await prisma!.contact.findUniqueOrThrow({
      where: { id: yara.id },
      include: { referredBy: { include: { referredBy: true } } },
    });
    assert.equal(chain.referredBy?.id, rebin.id);
    assert.equal(chain.referredBy?.referredBy?.id, andrew.id);
  });

  test("OpportunityContact.isPrimary enforces a single derived primary contact", async () => {
    const account = await prisma!.account.create({ data: { name: `Opp Co ${Date.now()}` } });
    const c1 = await prisma!.contact.create({ data: { firstName: "Primary", lastName: "Contact", accountId: account.id } });
    const c2 = await prisma!.contact.create({ data: { firstName: "Secondary", lastName: "Contact", accountId: account.id } });
    const opp = await prisma!.opportunity.create({
      data: { name: "Test Opportunity", product: "PLACEPULSE", accountId: account.id, type: "COMMERCIAL" },
    });

    const { setPrimaryContact, derivePrimaryContact } = await import("@/lib/opportunityContacts");
    await setPrimaryContact(opp.id, c1.id);
    await prisma!.opportunityContact.create({ data: { opportunityId: opp.id, contactId: c2.id } });

    let stakeholders = await prisma!.opportunityContact.findMany({ where: { opportunityId: opp.id } });
    assert.equal(derivePrimaryContact(stakeholders)?.contactId, c1.id);

    // Switching primary must not leave two isPrimary=true rows.
    await setPrimaryContact(opp.id, c2.id);
    stakeholders = await prisma!.opportunityContact.findMany({ where: { opportunityId: opp.id } });
    assert.equal(stakeholders.filter((s) => s.isPrimary).length, 1);
    assert.equal(derivePrimaryContact(stakeholders)?.contactId, c2.id);
  });

  test("AccountProduct relationship state is set explicitly, not inferred from Lead/Contact existence", async () => {
    const account = await prisma!.account.create({ data: { name: `Product State Co ${Date.now()}` } });
    // A Lead exists for this account/product, but no AccountProduct row yet —
    // relationship state must not be auto-created as CUSTOMER/PARTNER.
    await prisma!.lead.create({ data: { name: "Someone", primaryProduct: "PLACEPULSE", accountId: account.id } });

    const existing = await prisma!.accountProduct.findUnique({
      where: { accountId_productKey: { accountId: account.id, productKey: "PLACEPULSE" } },
    });
    assert.equal(existing, null);

    const state = await prisma!.accountProduct.create({
      data: { accountId: account.id, productKey: "PLACEPULSE", relationshipState: "PROSPECT" },
    });
    assert.equal(state.relationshipState, "PROSPECT");

    await assert.rejects(
      prisma!.accountProduct.create({ data: { accountId: account.id, productKey: "PLACEPULSE" } }),
      /Unique constraint/
    );
  });
});
