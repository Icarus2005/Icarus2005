import { prisma } from "./prisma";
import { isOverdue } from "./format";

// Internal, read-only production diagnostic. Every query here is a plain
// SELECT (Prisma find/count/groupBy) — this module must never call
// create/update/delete/upsert. See src/app/admin/data-audit/page.tsx for the
// page that renders this, gated by the app's existing CRM_ACCESS_PASSWORD
// middleware (src/middleware.ts), which already covers every route.
//
// Nothing here ever reads or surfaces process.env.DATABASE_URL /
// DIRECT_URL / any connection string — only application data.

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function groupCount<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const k = keyFn(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

const TRAVELPORT_TERMS = ["andy", "adrian", "travelport"];

function matchesTravelport(...fields: (string | null | undefined)[]): boolean {
  const haystack = fields.filter(Boolean).join(" ").toLowerCase();
  return TRAVELPORT_TERMS.some((t) => haystack.includes(t));
}

export async function getDataAudit() {
  const generatedAt = new Date().toISOString();

  const [accounts, contacts, leads, opportunities, activities, tasks, accountProducts] =
    await Promise.all([
      prisma.account.findMany({
        select: { id: true, name: true, tier: true, createdAt: true },
      }),
      prisma.contact.findMany({
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          title: true,
          role: true,
          relationshipStrength: true,
          sourceType: true,
          sourceDetail: true,
          acquisitionPath: true,
          accountId: true,
          account: { select: { name: true } },
        },
      }),
      prisma.lead.findMany({
        select: {
          id: true,
          name: true,
          company: true,
          status: true,
          primaryProduct: true,
          sourceType: true,
          sourceDetail: true,
          accountId: true,
          primaryContactId: true,
          convertedOpportunityId: true,
          notes: true,
          tasks: { select: { id: true, status: true } },
        },
      }),
      prisma.opportunity.findMany({
        select: {
          id: true,
          name: true,
          product: true,
          type: true,
          stage: true,
          value: true,
          accountId: true,
          account: { select: { name: true } },
          contacts: { select: { contactId: true, isPrimary: true } },
          activities: { select: { id: true } },
          tasks: { select: { id: true, status: true } },
        },
      }),
      prisma.activity.findMany({
        select: {
          id: true,
          type: true,
          subject: true,
          notes: true,
          leadId: true,
          accountId: true,
          contactId: true,
          opportunityId: true,
        },
      }),
      prisma.task.findMany({
        select: {
          id: true,
          title: true,
          notes: true,
          status: true,
          dueDate: true,
          leadId: true,
          accountId: true,
          contactId: true,
          opportunityId: true,
        },
      }),
      prisma.accountProduct.findMany({ select: { accountId: true, productKey: true } }),
    ]);

  // ─── ACCOUNTS ────────────────────────────────────────────────────────────
  const accountNameGroups = new Map<string, { id: string; name: string }[]>();
  for (const a of accounts) {
    const key = normalizeName(a.name);
    const arr = accountNameGroups.get(key) ?? [];
    arr.push({ id: a.id, name: a.name });
    accountNameGroups.set(key, arr);
  }
  const duplicateAccountNameGroups = Array.from(accountNameGroups.values()).filter((g) => g.length > 1);

  const placePulseAccountIdsFromLeads = new Set(
    leads.filter((l) => l.primaryProduct === "PLACEPULSE" && l.accountId).map((l) => l.accountId as string)
  );
  const placePulseAccountIdsFromOpps = new Set(
    opportunities.filter((o) => o.product === "PLACEPULSE").map((o) => o.accountId)
  );
  const accountProductKeySet = new Set(accountProducts.map((ap) => `${ap.accountId}:${ap.productKey}`));
  const placePulseImpliedAccountIds = new Set<string>();
  placePulseAccountIdsFromLeads.forEach((id) => placePulseImpliedAccountIds.add(id));
  placePulseAccountIdsFromOpps.forEach((id) => placePulseImpliedAccountIds.add(id));
  const accountsLackingAccountProduct = accounts.filter(
    (a) => placePulseImpliedAccountIds.has(a.id) && !accountProductKeySet.has(`${a.id}:PLACEPULSE`)
  );

  // ─── CONTACTS ────────────────────────────────────────────────────────────
  const emailGroups = new Map<string, { id: string; name: string }[]>();
  for (const c of contacts) {
    if (!c.email) continue;
    const key = c.email.trim().toLowerCase();
    const arr = emailGroups.get(key) ?? [];
    arr.push({ id: c.id, name: `${c.firstName} ${c.lastName}` });
    emailGroups.set(key, arr);
  }
  const duplicateContactEmails = Array.from(emailGroups.entries())
    .filter(([, arr]) => arr.length > 1)
    .map(([email, arr]) => ({ email, contacts: arr }));

  const nameAccountGroups = new Map<string, { id: string; name: string; account: string }[]>();
  for (const c of contacts) {
    const key = `${normalizeName(`${c.firstName} ${c.lastName}`)}::${c.accountId}`;
    const arr = nameAccountGroups.get(key) ?? [];
    arr.push({ id: c.id, name: `${c.firstName} ${c.lastName}`, account: c.account.name });
    nameAccountGroups.set(key, arr);
  }
  const duplicateContactNameAccountGroups = Array.from(nameAccountGroups.values()).filter((g) => g.length > 1);

  const roleDistribution = groupCount(contacts, (c) => c.role ?? "UNSET");
  const relationshipStrengthDistribution = groupCount(contacts, (c) => c.relationshipStrength ?? "UNSET");
  const contactsMissingProvenance = contacts.filter((c) => !c.sourceType && !c.sourceDetail && !c.acquisitionPath).length;

  // ─── LEADS ───────────────────────────────────────────────────────────────
  const statusDistribution = groupCount(leads, (l) => l.status);
  const productDistribution = groupCount(leads, (l) => l.primaryProduct);
  const sourceDistribution = groupCount(leads, (l) => l.sourceType ?? "UNSET");
  const companyValueCounts = groupCount(
    leads.filter((l) => l.company),
    (l) => l.company as string
  );
  const accountNamesNormalized = new Set(accounts.map((a) => normalizeName(a.name)));
  const leadsCompanyMatchesAccount = leads.filter((l) => l.company && accountNamesNormalized.has(normalizeName(l.company))).length;
  const leadsCompanyNoAccountMatch = leads.filter((l) => l.company && !accountNamesNormalized.has(normalizeName(l.company))).length;
  const leadsAccountIdNull = leads.filter((l) => !l.accountId).length;
  const leadsPrimaryContactIdNull = leads.filter((l) => !l.primaryContactId).length;

  const leadDupGroups = new Map<string, { id: string; name: string; company: string | null }[]>();
  for (const l of leads) {
    const key = `${normalizeName(l.name)}::${l.company ? normalizeName(l.company) : ""}`;
    const arr = leadDupGroups.get(key) ?? [];
    arr.push({ id: l.id, name: l.name, company: l.company });
    leadDupGroups.set(key, arr);
  }
  const duplicateLeadCandidates = Array.from(leadDupGroups.values()).filter((g) => g.length > 1);

  const qualifiedLeadsNoOpportunity = leads.filter((l) => l.status === "QUALIFIED" && !l.convertedOpportunityId);
  const qualifiedLeadsNoOpenTask = qualifiedLeadsNoOpportunity.filter(
    (l) => !l.tasks.some((t) => t.status === "OPEN")
  );

  // ─── OPPORTUNITIES ───────────────────────────────────────────────────────
  const oppStageDistribution = groupCount(opportunities, (o) => o.stage);
  const oppTypeDistribution = groupCount(opportunities, (o) => o.type ?? "UNSET");
  const oppsNoContacts = opportunities.filter((o) => o.contacts.length === 0);
  const oppsNoPrimaryContact = opportunities.filter((o) => o.contacts.length > 0 && !o.contacts.some((c) => c.isPrimary));
  const oppsNoActivity = opportunities.filter((o) => o.activities.length === 0);
  const oppsNoOpenTask = opportunities.filter((o) => !o.tasks.some((t) => t.status === "OPEN"));
  const oppsZeroOrUnknownValue = opportunities.filter((o) => o.value == null || o.value === 0);

  // ─── TASKS ───────────────────────────────────────────────────────────────
  const taskStatusDistribution = groupCount(tasks, (t) => t.status);
  const tasksNoDueDate = tasks.filter((t) => !t.dueDate);
  const tasksOverdue = tasks.filter((t) => t.status === "OPEN" && isOverdue(t.dueDate));
  const orphanTasks = tasks.filter((t) => !t.leadId && !t.accountId && !t.contactId && !t.opportunityId);

  // ─── ACTIVITIES ──────────────────────────────────────────────────────────
  const activityTypeDistribution = groupCount(activities, (a) => a.type);
  const orphanActivities = activities.filter((a) => !a.leadId && !a.accountId && !a.contactId && !a.opportunityId);
  const accountIdsWithActivity = new Set(activities.filter((a) => a.accountId).map((a) => a.accountId as string));
  const contactIdsWithActivity = new Set(activities.filter((a) => a.contactId).map((a) => a.contactId as string));
  const oppIdsWithActivity = new Set(activities.filter((a) => a.opportunityId).map((a) => a.opportunityId as string));
  const accountsWithNoActivity = accounts.filter((a) => !accountIdsWithActivity.has(a.id)).length;
  const contactsWithNoActivity = contacts.filter((c) => !contactIdsWithActivity.has(c.id)).length;
  const opportunitiesWithNoActivity = opportunities.filter((o) => !oppIdsWithActivity.has(o.id)).length;

  // ─── TRAVELPORT CHECK (analysis only — no corrections) ──────────────────
  const travelport = {
    contacts: contacts
      .filter((c) => matchesTravelport(c.firstName, c.lastName, c.title, c.account.name))
      .map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`, title: c.title, account: c.account.name })),
    leads: leads
      .filter((l) => matchesTravelport(l.name, l.company, l.notes))
      .map((l) => ({ id: l.id, name: l.name, company: l.company })),
    accounts: accounts
      .filter((a) => matchesTravelport(a.name))
      .map((a) => ({ id: a.id, name: a.name })),
    opportunities: opportunities
      .filter((o) => matchesTravelport(o.name, o.account.name))
      .map((o) => ({ id: o.id, name: o.name, account: o.account.name })),
    activities: activities
      .filter((a) => matchesTravelport(a.subject, a.notes))
      .map((a) => ({ id: a.id, subject: a.subject })),
    tasks: tasks
      .filter((t) => matchesTravelport(t.title, t.notes))
      .map((t) => ({ id: t.id, title: t.title })),
  };

  return {
    generatedAt,
    summary: {
      accounts: accounts.length,
      contacts: contacts.length,
      leads: leads.length,
      opportunities: opportunities.length,
      activities: activities.length,
      tasks: tasks.length,
    },
    accounts: {
      duplicateNameGroups: duplicateAccountNameGroups,
      accountsWithPlacePulseLeads: placePulseAccountIdsFromLeads.size,
      accountsWithPlacePulseOpportunities: placePulseAccountIdsFromOpps.size,
      accountsLackingAccountProduct: accountsLackingAccountProduct.map((a) => ({ id: a.id, name: a.name })),
    },
    contacts: {
      duplicateEmails: duplicateContactEmails,
      duplicateNameAccountGroups: duplicateContactNameAccountGroups,
      roleDistribution,
      relationshipStrengthDistribution,
      missingProvenance: contactsMissingProvenance,
    },
    leads: {
      statusDistribution,
      productDistribution,
      sourceDistribution,
      companyValueCounts,
      companyMatchesAccount: leadsCompanyMatchesAccount,
      companyNoAccountMatch: leadsCompanyNoAccountMatch,
      accountIdNull: leadsAccountIdNull,
      primaryContactIdNull: leadsPrimaryContactIdNull,
      duplicateCandidates: duplicateLeadCandidates,
      qualifiedNoOpportunity: qualifiedLeadsNoOpportunity.map((l) => ({ id: l.id, name: l.name })),
      qualifiedNoOpenTask: qualifiedLeadsNoOpenTask.map((l) => ({ id: l.id, name: l.name })),
    },
    opportunities: {
      stageDistribution: oppStageDistribution,
      typeDistribution: oppTypeDistribution,
      noContacts: oppsNoContacts.map((o) => ({ id: o.id, name: o.name })),
      noPrimaryContact: oppsNoPrimaryContact.map((o) => ({ id: o.id, name: o.name })),
      noActivity: oppsNoActivity.map((o) => ({ id: o.id, name: o.name })),
      noOpenTask: oppsNoOpenTask.map((o) => ({ id: o.id, name: o.name })),
      zeroOrUnknownValue: oppsZeroOrUnknownValue.map((o) => ({ id: o.id, name: o.name })),
    },
    tasks: {
      statusDistribution: taskStatusDistribution,
      noDueDate: tasksNoDueDate.length,
      overdue: tasksOverdue.length,
      orphan: orphanTasks.map((t) => ({ id: t.id, title: t.title })),
    },
    activities: {
      total: activities.length,
      typeDistribution: activityTypeDistribution,
      orphan: orphanActivities.map((a) => ({ id: a.id, subject: a.subject })),
      accountsWithNoActivity,
      contactsWithNoActivity,
      opportunitiesWithNoActivity,
    },
    travelport,
    productRelationships: {
      placePulseAccountsLackingAccountProduct: accountsLackingAccountProduct.map((a) => ({ id: a.id, name: a.name })),
    },
  };
}

export type DataAudit = Awaited<ReturnType<typeof getDataAudit>>;
