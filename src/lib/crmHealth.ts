import { prisma } from "./prisma";
import { addDubaiDays, isOverdueDubai, startOfDubaiDay } from "./dubaiTime";

export type HealthEntity = "account" | "contact" | "lead" | "opportunity" | "task" | "activity";
export type HealthSeverity = "urgent" | "attention" | "review";

export type CrmHealthRecord = {
  entity: HealthEntity;
  id: string;
  label: string;
  href: string;
  actionHref?: string;
  actionLabel?: string;
  detail?: string;
};

export type CrmHealthIssue = {
  key: string;
  title: string;
  description: string;
  severity: HealthSeverity;
  records: CrmHealthRecord[];
};

export const CRM_HEALTH_THRESHOLDS = {
  recentOpportunityActivityDays: 30,
  staleLeadDays: 30,
  staleRelationshipDays: 90,
  upcomingCommitmentDays: 7,
} as const;

export type CrmHealthThresholds = {
  recentOpportunityActivityDays: number;
  staleLeadDays: number;
  staleRelationshipDays: number;
  upcomingCommitmentDays: number;
};

type ActivityRef = { date: Date | string };
type TaskRef = { status: string };

export type CrmHealthInput = {
  accounts: Array<{
    id: string;
    name: string;
    createdAt: Date | string;
    activities: ActivityRef[];
    accountProducts: Array<{ productKey: string }>;
  }>;
  contacts: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    accountId: string;
    account: { name: string };
    createdAt: Date | string;
    activities: ActivityRef[];
  }>;
  leads: Array<{
    id: string;
    name: string;
    company: string | null;
    status: string;
    primaryProduct: string;
    accountId: string | null;
    primaryContactId: string | null;
    convertedOpportunityId: string | null;
    createdAt: Date | string;
    activities: ActivityRef[];
    tasks: TaskRef[];
  }>;
  opportunities: Array<{
    id: string;
    name: string;
    accountId: string;
    product: string;
    stage: string;
    createdAt: Date | string;
    stageRef: { isWon: boolean; isLost: boolean } | null;
    contacts: Array<{ contactId: string; isPrimary: boolean }>;
    activities: ActivityRef[];
    tasks: TaskRef[];
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    dueDate: Date | string | null;
    leadId: string | null;
    accountId: string | null;
    contactId: string | null;
    opportunityId: string | null;
  }>;
  activities: Array<{
    id: string;
    subject: string;
    leadId: string | null;
    accountId: string | null;
    contactId: string | null;
    opportunityId: string | null;
  }>;
};

const DAY_MS = 86_400_000;

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function latestActivityDate(activities: ActivityRef[]): Date | null {
  if (activities.length === 0) return null;
  return new Date(Math.max(...activities.map((activity) => new Date(activity.date).getTime())));
}

export function isOlderThanDays(value: Date | string, days: number, now: Date): boolean {
  return new Date(value).getTime() < now.getTime() - days * DAY_MS;
}

export function isOpenOpportunityRecord(opportunity: {
  stage: string;
  stageRef?: { isWon: boolean; isLost: boolean } | null;
  closedAt?: Date | string | null;
}): boolean {
  return !opportunity.closedAt &&
    !(opportunity.stageRef?.isWon || opportunity.stageRef?.isLost || /^CLOSED_/i.test(opportunity.stage));
}

/**
 * One shared definition for Account-level open-deal counts and pipeline value.
 * Stage metadata is authoritative where available; the CLOSED_* check keeps
 * legacy records safe when their pipeline-stage relation is missing.
 */
export function summarizeOpenOpportunityPipeline(opportunities: Array<{
  stage: string;
  stageRef?: { isWon: boolean; isLost: boolean } | null;
  closedAt?: Date | string | null;
  value?: number | null;
}>): { openDealCount: number; pipelineValue: number } {
  const openOpportunities = opportunities.filter(isOpenOpportunityRecord);
  return {
    openDealCount: openOpportunities.length,
    pipelineValue: openOpportunities.reduce((sum, opportunity) => sum + (opportunity.value ?? 0), 0),
  };
}

function record(
  entity: HealthEntity,
  id: string,
  label: string,
  href: string,
  action?: Pick<CrmHealthRecord, "actionHref" | "actionLabel" | "detail">
): CrmHealthRecord {
  return { entity, id, label, href, ...action };
}

function duplicateRecords<T>(
  items: T[],
  key: (item: T) => string | null,
  toRecord: (item: T, groupNumber: number) => CrmHealthRecord
): CrmHealthRecord[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const value = key(item);
    if (!value) continue;
    groups.set(value, [...(groups.get(value) ?? []), item]);
  }
  return Array.from(groups.values())
    .filter((group) => group.length > 1)
    .flatMap((group, index) => group.map((item) => toRecord(item, index + 1)));
}

export function buildCrmHealth(
  input: CrmHealthInput,
  now = new Date(),
  thresholds: CrmHealthThresholds = CRM_HEALTH_THRESHOLDS
) {
  const openOpportunity = (opportunity: CrmHealthInput["opportunities"][number]) =>
    isOpenOpportunityRecord(opportunity);

  const duplicateAccounts = duplicateRecords(
    input.accounts,
    (account) => normalize(account.name),
    (account, group) => record("account", account.id, account.name, `/accounts/${account.id}`, { detail: `Duplicate candidate group ${group}` })
  );
  const duplicateContactsByEmail = duplicateRecords(
    input.contacts,
    (contact) => contact.email?.trim().toLowerCase() ?? null,
    (contact, group) => record("contact", contact.id, `${contact.firstName} ${contact.lastName}`, `/contacts/${contact.id}`, { detail: `Same-email candidate group ${group}` })
  );
  const duplicateContactsByName = duplicateRecords(
    input.contacts,
    (contact) => `${normalize(`${contact.firstName} ${contact.lastName}`)}::${contact.accountId}`,
    (contact, group) => record("contact", contact.id, `${contact.firstName} ${contact.lastName}`, `/contacts/${contact.id}`, { detail: `Same-name/account candidate group ${group}` })
  );
  const duplicateLeads = duplicateRecords(
    input.leads,
    (lead) => `${normalize(lead.name)}::${normalize(lead.company ?? "")}`,
    (lead, group) => record("lead", lead.id, lead.name, `/leads/${lead.id}`, { detail: `Duplicate candidate group ${group}` })
  );

  const leadsWithoutAccounts = input.leads
    .filter((lead) => !lead.accountId)
    .map((lead) => record("lead", lead.id, lead.name, `/leads/${lead.id}`, { actionHref: `/leads/${lead.id}/edit`, actionLabel: "Link account", detail: lead.company ?? "No company recorded" }));
  const leadsWithoutContacts = input.leads
    .filter((lead) => !lead.primaryContactId)
    .map((lead) => record("lead", lead.id, lead.name, `/leads/${lead.id}`, { actionHref: `/leads/${lead.id}/edit`, actionLabel: "Link contact" }));
  const qualifiedWithoutOpportunity = input.leads
    .filter((lead) => lead.status === "QUALIFIED" && !lead.convertedOpportunityId)
    .map((lead) => record("lead", lead.id, lead.name, `/leads/${lead.id}`, { actionHref: `/leads/${lead.id}/convert`, actionLabel: "Convert" }));
  const qualifiedWithoutTask = input.leads
    .filter((lead) => lead.status === "QUALIFIED" && !lead.tasks.some((task) => task.status === "OPEN"))
    .map((lead) => record("lead", lead.id, lead.name, `/leads/${lead.id}`, { actionHref: `/tasks/new?leadId=${lead.id}&product=${lead.primaryProduct}`, actionLabel: "Add next task" }));

  const opportunitiesWithoutContacts = input.opportunities
    .filter((opportunity) => openOpportunity(opportunity) && opportunity.contacts.length === 0)
    .map((opportunity) => record("opportunity", opportunity.id, opportunity.name, `/opportunities/${opportunity.id}`, { actionHref: `/opportunities/${opportunity.id}/edit`, actionLabel: "Add contact" }));
  const opportunitiesWithoutRecentActivity = input.opportunities
    .filter((opportunity) => {
      if (!openOpportunity(opportunity)) return false;
      const latest = latestActivityDate(opportunity.activities);
      return !latest || isOlderThanDays(latest, thresholds.recentOpportunityActivityDays, now);
    })
    .map((opportunity) => {
      const latest = latestActivityDate(opportunity.activities);
      return record("opportunity", opportunity.id, opportunity.name, `/opportunities/${opportunity.id}`, {
        actionHref: `/activities/new?opportunityId=${opportunity.id}&product=${opportunity.product}`,
        actionLabel: "Log activity",
        detail: latest ? `Last activity ${latest.toISOString().slice(0, 10)}` : "No activity recorded",
      });
    });
  const opportunitiesWithoutTasks = input.opportunities
    .filter((opportunity) => openOpportunity(opportunity) && !opportunity.tasks.some((task) => task.status === "OPEN"))
    .map((opportunity) => record("opportunity", opportunity.id, opportunity.name, `/opportunities/${opportunity.id}`, { actionHref: `/tasks/new?opportunityId=${opportunity.id}&product=${opportunity.product}`, actionLabel: "Add next task" }));

  const overdueTasks = input.tasks
    .filter((task) => task.status === "OPEN" && isOverdueDubai(task.dueDate, now))
    .map((task) => record("task", task.id, task.title, "/tasks", { actionHref: "/tasks", actionLabel: "Review task", detail: task.dueDate ? `Due ${new Date(task.dueDate).toISOString().slice(0, 10)}` : undefined }));
  const todayInDubai = startOfDubaiDay(now);
  const upcomingCommitmentEnd = addDubaiDays(todayInDubai, thresholds.upcomingCommitmentDays + 1);
  const upcomingTasks = input.tasks
    .filter((task) => {
      if (task.status !== "OPEN" || !task.dueDate) return false;
      const dueAt = new Date(task.dueDate).getTime();
      return dueAt >= todayInDubai.getTime() && dueAt < upcomingCommitmentEnd.getTime();
    })
    .map((task) => record("task", task.id, task.title, "/tasks", {
      actionHref: "/tasks",
      actionLabel: "Review commitment",
      detail: `Due ${new Date(task.dueDate!).toISOString().slice(0, 10)}`,
    }));
  const orphanTasks = input.tasks
    .filter((task) => !task.leadId && !task.accountId && !task.contactId && !task.opportunityId)
    .map((task) => record("task", task.id, task.title, "/tasks", { actionHref: "/tasks", actionLabel: "Review linkage" }));
  const orphanActivities = input.activities
    .filter((activity) => !activity.leadId && !activity.accountId && !activity.contactId && !activity.opportunityId)
    .map((activity) => record("activity", activity.id, activity.subject, "/activities", { actionHref: "/activities", actionLabel: "Review linkage" }));

  const missingProduct = [
    ...input.leads
      .filter((lead) => lead.primaryProduct === "UNASSIGNED")
      .map((lead) => record("lead" as const, lead.id, lead.name, `/leads/${lead.id}`, { actionHref: `/leads/${lead.id}/edit`, actionLabel: "Assign product" })),
    ...input.opportunities
      .filter((opportunity) => opportunity.product === "UNASSIGNED")
      .map((opportunity) => record("opportunity" as const, opportunity.id, opportunity.name, `/opportunities/${opportunity.id}`, { actionHref: `/opportunities/${opportunity.id}/edit`, actionLabel: "Assign product" })),
  ];

  const discussedProductsByAccount = new Map<string, Set<string>>();
  const noteProduct = (accountId: string | null, product: string) => {
    if (!accountId || product === "UNASSIGNED") return;
    const products = discussedProductsByAccount.get(accountId) ?? new Set<string>();
    products.add(product);
    discussedProductsByAccount.set(accountId, products);
  };
  input.leads.forEach((lead) => noteProduct(lead.accountId, lead.primaryProduct));
  input.opportunities.forEach((opportunity) => noteProduct(opportunity.accountId, opportunity.product));
  const inconsistentProductCoverage = input.accounts.flatMap((account) => {
    const recordedProducts = new Set(account.accountProducts.map((item) => item.productKey));
    return Array.from(discussedProductsByAccount.get(account.id) ?? [])
      .filter((product) => !recordedProducts.has(product))
      .map((product) => record("account" as const, account.id, account.name, `/accounts/${account.id}`, {
        actionHref: `/accounts/${account.id}`,
        actionLabel: "Review product coverage",
        detail: `${product} appears on a linked Lead or Opportunity but is absent from Account products`,
      }));
  });

  const staleLeads = input.leads
    .filter((lead) => {
      if (lead.convertedOpportunityId || lead.status === "DISQUALIFIED") return false;
      const latest = latestActivityDate(lead.activities);
      return isOlderThanDays(latest ?? lead.createdAt, thresholds.staleLeadDays, now);
    })
    .map((lead) => record("lead", lead.id, lead.name, `/leads/${lead.id}`, { actionHref: `/activities/new?leadId=${lead.id}&product=${lead.primaryProduct}`, actionLabel: "Log activity", detail: `No activity in ${thresholds.staleLeadDays}+ days` }));
  const staleAccounts = input.accounts
    .filter((account) => isOlderThanDays(latestActivityDate(account.activities) ?? account.createdAt, thresholds.staleRelationshipDays, now))
    .map((account) => record("account", account.id, account.name, `/accounts/${account.id}`, { actionHref: `/activities/new?accountId=${account.id}`, actionLabel: "Log activity", detail: `No account activity in ${thresholds.staleRelationshipDays}+ days` }));
  const staleContacts = input.contacts
    .filter((contact) => isOlderThanDays(latestActivityDate(contact.activities) ?? contact.createdAt, thresholds.staleRelationshipDays, now))
    .map((contact) => record("contact", contact.id, `${contact.firstName} ${contact.lastName}`, `/contacts/${contact.id}`, { actionHref: `/activities/new?contactId=${contact.id}&accountId=${contact.accountId}`, actionLabel: "Log activity", detail: `No contact activity in ${thresholds.staleRelationshipDays}+ days` }));

  const issues: CrmHealthIssue[] = [
    { key: "duplicate-accounts", title: "Duplicate accounts", description: "Review normalized-name matches. Nothing is merged automatically.", severity: "review", records: duplicateAccounts },
    { key: "duplicate-contact-emails", title: "Duplicate contact emails", description: "Review contacts sharing the same normalized email.", severity: "review", records: duplicateContactsByEmail },
    { key: "duplicate-contact-names", title: "Duplicate contacts by name and account", description: "Review same-name contacts inside one account.", severity: "review", records: duplicateContactsByName },
    { key: "duplicate-leads", title: "Duplicate leads", description: "Review normalized lead-name and company matches.", severity: "review", records: duplicateLeads },
    { key: "leads-without-accounts", title: "Leads without Account links", description: "Link the existing Account or review before creating one.", severity: "attention", records: leadsWithoutAccounts },
    { key: "leads-without-contacts", title: "Leads without primary Contacts", description: "Every active relationship should identify its primary person.", severity: "attention", records: leadsWithoutContacts },
    { key: "qualified-without-opportunity", title: "Qualified leads without Opportunities", description: "Convert or explicitly re-qualify these leads.", severity: "urgent", records: qualifiedWithoutOpportunity },
    { key: "qualified-without-task", title: "Qualified leads without open Tasks", description: "Add the canonical next action so qualification cannot disappear.", severity: "urgent", records: qualifiedWithoutTask },
    { key: "opportunities-without-contacts", title: "Opportunities without Contacts", description: "Add at least one stakeholder and mark the primary contact.", severity: "urgent", records: opportunitiesWithoutContacts },
    { key: "opportunities-without-activity", title: "Opportunities without recent Activity", description: `Open deals need a recorded interaction within ${thresholds.recentOpportunityActivityDays} days.`, severity: "attention", records: opportunitiesWithoutRecentActivity },
    { key: "opportunities-without-task", title: "Opportunities without open Tasks", description: "Open deals need a canonical next action.", severity: "urgent", records: opportunitiesWithoutTasks },
    { key: "overdue-tasks", title: "Overdue Tasks", description: "Review commitments whose Dubai calendar due date has passed.", severity: "urgent", records: overdueTasks },
    { key: "upcoming-tasks", title: "Upcoming commitments", description: `Open Tasks due today or in the next ${thresholds.upcomingCommitmentDays} Dubai calendar days.`, severity: "review", records: upcomingTasks },
    { key: "orphan-tasks", title: "Orphan Tasks", description: "Review tasks that are not linked to any CRM record.", severity: "attention", records: orphanTasks },
    { key: "orphan-activities", title: "Orphan Activities", description: "Review activities that are not linked to any CRM record.", severity: "attention", records: orphanActivities },
    { key: "missing-product", title: "Missing product assignment", description: "Assign a canonical business line without changing entity distinctions.", severity: "attention", records: missingProduct },
    { key: "inconsistent-product-coverage", title: "Inconsistent Account product coverage", description: "Review Accounts whose linked Leads or Opportunities discuss a product missing from Account products.", severity: "review", records: inconsistentProductCoverage },
    { key: "stale-leads", title: "Stale Leads", description: `Unconverted active leads with no activity in ${thresholds.staleLeadDays} days.`, severity: "attention", records: staleLeads },
    { key: "stale-accounts", title: "Stale Accounts", description: "Accounts with no directly linked activity in 90 days.", severity: "review", records: staleAccounts },
    { key: "stale-contacts", title: "Stale Contacts", description: "Contacts with no directly linked activity in 90 days.", severity: "review", records: staleContacts },
  ];

  const countFor = (severity: HealthSeverity) => issues.filter((issue) => issue.severity === severity).reduce((sum, issue) => sum + issue.records.length, 0);
  return {
    generatedAt: now.toISOString(),
    thresholds: { ...thresholds },
    summary: {
      urgent: countFor("urgent"),
      attention: countFor("attention"),
      review: countFor("review"),
      healthyRules: issues.filter((issue) => issue.records.length === 0).length,
      totalRules: issues.length,
    },
    issues,
  };
}

export async function getCrmHealth(now = new Date()) {
  const [accounts, contacts, leads, opportunities, tasks, activities] = await Promise.all([
    prisma.account.findMany({
      select: {
        id: true,
        name: true,
        createdAt: true,
        activities: { select: { date: true } },
        accountProducts: { select: { productKey: true } },
      },
    }),
    prisma.contact.findMany({
      select: {
        id: true, firstName: true, lastName: true, email: true, accountId: true, createdAt: true,
        account: { select: { name: true } }, activities: { select: { date: true } },
      },
    }),
    prisma.lead.findMany({
      select: {
        id: true, name: true, company: true, status: true, primaryProduct: true, accountId: true,
        primaryContactId: true, convertedOpportunityId: true, createdAt: true,
        activities: { select: { date: true } }, tasks: { select: { status: true } },
      },
    }),
    prisma.opportunity.findMany({
      select: {
        id: true, name: true, accountId: true, product: true, stage: true, createdAt: true,
        stageRef: { select: { isWon: true, isLost: true } },
        contacts: { select: { contactId: true, isPrimary: true } },
        activities: { select: { date: true } }, tasks: { select: { status: true } },
      },
    }),
    prisma.task.findMany({
      select: { id: true, title: true, status: true, dueDate: true, leadId: true, accountId: true, contactId: true, opportunityId: true },
    }),
    prisma.activity.findMany({
      select: { id: true, subject: true, leadId: true, accountId: true, contactId: true, opportunityId: true },
    }),
  ]);
  return buildCrmHealth({ accounts, contacts, leads, opportunities, tasks, activities }, now);
}

export type CrmHealth = Awaited<ReturnType<typeof getCrmHealth>>;
