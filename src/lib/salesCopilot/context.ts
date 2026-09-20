/**
 * Sales Copilot — context builder (Sprint 06C, Phase 2).
 *
 * Gathers only the CRM data relevant to ONE Lead / Contact / Opportunity —
 * never the whole database, never other clients' records. This is the only
 * place that reads CRM data for the Copilot; the prompt builder and API
 * route consume its output rather than querying Prisma themselves, so every
 * Copilot action is guaranteed to see the same bounded context shape.
 *
 * Caps (Phase 10 — cost/token control): at most 8 recent Activities and 5
 * open Tasks are included, newest/soonest first. No vector search, no
 * embeddings, no cross-entity fan-out beyond the direct relations below.
 */
import { prisma } from "@/lib/prisma";
import { productLabel } from "@/lib/products";
import { LEAD_STATUSES, RELATIONSHIP_STRENGTHS, ACQUISITION_PATHS } from "@/lib/constants";
import { deriveNextInteraction, deriveLastInteraction } from "@/lib/nextInteraction";

export const SALES_COPILOT_ENTITY_TYPES = ["LEAD", "CONTACT", "OPPORTUNITY"] as const;
export type SalesCopilotEntityType = (typeof SALES_COPILOT_ENTITY_TYPES)[number];

export function isSalesCopilotEntityType(v: unknown): v is SalesCopilotEntityType {
  return typeof v === "string" && (SALES_COPILOT_ENTITY_TYPES as readonly string[]).includes(v);
}

const MAX_ACTIVITIES = 8;
const MAX_OPEN_TASKS = 5;

export type SalesContextActivity = { type: string; subject: string; notes: string | null; date: string };
export type SalesContextTask = { title: string; dueDate: string | null; clientCommitmentDate: string | null };

export type SalesContext = {
  entityType: SalesCopilotEntityType;
  entityId: string;
  contactName: string | null;
  jobTitle: string | null;
  accountName: string | null;
  leadStatus: string | null;
  opportunityStage: string | null;
  productLabel: string | null;
  relationshipStrength: string | null;
  sourceType: string | null;
  sourceDetail: string | null;
  acquisitionPath: string | null;
  referredByName: string | null;
  primaryContactName: string | null;
  opportunityContext: { name: string; stage: string; value: number | null; healthStatus: string } | null;
  notes: string | null;
  useCase: string | null;
  lastInteractionDate: string | null;
  lastInteractionSummary: string | null;
  recentActivities: SalesContextActivity[];
  openTasks: SalesContextTask[];
  nextDueTask: { title: string; dueDate: string | null } | null;
};

function toIso(d: Date | string | null | undefined): string | null {
  return d ? new Date(d).toISOString() : null;
}

function capActivities(activities: { type: string; subject: string; notes: string | null; date: Date }[]): SalesContextActivity[] {
  return [...activities]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, MAX_ACTIVITIES)
    .map((a) => ({ type: a.type, subject: a.subject, notes: a.notes, date: toIso(a.date)! }));
}

function capOpenTasks(tasks: { title: string; dueDate: Date | null; clientCommitmentDate: Date | null; status: string }[]): SalesContextTask[] {
  return tasks
    .filter((t) => t.status !== "DONE")
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    })
    .slice(0, MAX_OPEN_TASKS)
    .map((t) => ({ title: t.title, dueDate: toIso(t.dueDate), clientCommitmentDate: toIso(t.clientCommitmentDate) }));
}

async function buildFromLead(entityId: string): Promise<SalesContext | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: entityId },
    include: {
      account: { select: { name: true } },
      primaryContact: { select: { firstName: true, lastName: true, title: true } },
      activities: { select: { type: true, subject: true, notes: true, date: true } },
      tasks: { select: { title: true, dueDate: true, clientCommitmentDate: true, status: true } },
    },
  });
  if (!lead) return null;

  const recentActivities = capActivities(lead.activities);
  const openTasks = capOpenTasks(lead.tasks);
  const last = deriveLastInteraction(lead.activities.map((a) => ({ type: a.type, subject: a.subject, date: a.date })));
  const next = deriveNextInteraction(
    lead.tasks.filter((t) => t.status !== "DONE").map((t) => ({ title: t.title, dueDate: t.dueDate })),
    lead.nextAction,
    lead.nextActionDate
  );

  return {
    entityType: "LEAD",
    entityId,
    contactName: lead.primaryContact ? `${lead.primaryContact.firstName} ${lead.primaryContact.lastName}` : lead.name,
    jobTitle: lead.primaryContact?.title ?? lead.title ?? null,
    accountName: lead.account?.name ?? lead.company ?? null,
    leadStatus: LEAD_STATUSES[lead.status] ?? lead.status,
    opportunityStage: null,
    productLabel: productLabel(lead.primaryProduct),
    relationshipStrength: null,
    sourceType: lead.sourceType,
    sourceDetail: lead.sourceDetail,
    acquisitionPath: null,
    referredByName: null,
    primaryContactName: lead.primaryContact ? `${lead.primaryContact.firstName} ${lead.primaryContact.lastName}` : null,
    opportunityContext: null,
    notes: lead.notes,
    useCase: lead.useCase,
    lastInteractionDate: last ? toIso(last.date) : null,
    lastInteractionSummary: last ? `${last.type}: ${last.label}` : null,
    recentActivities,
    openTasks,
    nextDueTask: next ? { title: next.label, dueDate: toIso(next.date) } : null,
  };
}

async function buildFromContact(entityId: string): Promise<SalesContext | null> {
  const contact = await prisma.contact.findUnique({
    where: { id: entityId },
    include: {
      account: { select: { name: true } },
      referredBy: { select: { firstName: true, lastName: true } },
      opportunities: {
        include: { opportunity: { select: { name: true, stage: true, value: true, healthStatus: true } } },
      },
      activities: { select: { type: true, subject: true, notes: true, date: true } },
      tasks: { select: { title: true, dueDate: true, clientCommitmentDate: true, status: true } },
    },
  });
  if (!contact) return null;

  const recentActivities = capActivities(contact.activities);
  const openTasks = capOpenTasks(contact.tasks);
  const last = deriveLastInteraction(contact.activities.map((a) => ({ type: a.type, subject: a.subject, date: a.date })));
  const next = deriveNextInteraction(
    contact.tasks.filter((t) => t.status !== "DONE").map((t) => ({ title: t.title, dueDate: t.dueDate })),
    null,
    null
  );
  const primaryOpp = contact.opportunities[0]?.opportunity ?? null;

  return {
    entityType: "CONTACT",
    entityId,
    contactName: `${contact.firstName} ${contact.lastName}`,
    jobTitle: contact.title,
    accountName: contact.account?.name ?? null,
    leadStatus: null,
    opportunityStage: primaryOpp?.stage ?? null,
    productLabel: null,
    relationshipStrength: contact.relationshipStrength ? (RELATIONSHIP_STRENGTHS[contact.relationshipStrength] ?? contact.relationshipStrength) : null,
    sourceType: contact.sourceType,
    sourceDetail: contact.sourceDetail,
    acquisitionPath: contact.acquisitionPath ? (ACQUISITION_PATHS[contact.acquisitionPath] ?? contact.acquisitionPath) : null,
    referredByName: contact.referredBy ? `${contact.referredBy.firstName} ${contact.referredBy.lastName}` : null,
    primaryContactName: null,
    opportunityContext: primaryOpp
      ? { name: primaryOpp.name, stage: primaryOpp.stage, value: primaryOpp.value, healthStatus: primaryOpp.healthStatus }
      : null,
    notes: null,
    useCase: null,
    lastInteractionDate: last ? toIso(last.date) : null,
    lastInteractionSummary: last ? `${last.type}: ${last.label}` : null,
    recentActivities,
    openTasks,
    nextDueTask: next ? { title: next.label, dueDate: toIso(next.date) } : null,
  };
}

async function buildFromOpportunity(entityId: string): Promise<SalesContext | null> {
  const opp = await prisma.opportunity.findUnique({
    where: { id: entityId },
    include: {
      account: { select: { name: true } },
      contacts: { include: { contact: { select: { firstName: true, lastName: true, title: true, relationshipStrength: true, sourceType: true, sourceDetail: true } } } },
      activities: { select: { type: true, subject: true, notes: true, date: true } },
      tasks: { select: { title: true, dueDate: true, clientCommitmentDate: true, status: true } },
    },
  });
  if (!opp) return null;

  const recentActivities = capActivities(opp.activities);
  const openTasks = capOpenTasks(opp.tasks);
  const last = deriveLastInteraction(opp.activities.map((a) => ({ type: a.type, subject: a.subject, date: a.date })));
  const next = deriveNextInteraction(
    opp.tasks.filter((t) => t.status !== "DONE").map((t) => ({ title: t.title, dueDate: t.dueDate })),
    opp.nextAction,
    opp.nextActionDate
  );
  const primary = opp.contacts.find((c) => c.isPrimary)?.contact ?? opp.contacts[0]?.contact ?? null;

  return {
    entityType: "OPPORTUNITY",
    entityId,
    contactName: primary ? `${primary.firstName} ${primary.lastName}` : null,
    jobTitle: primary?.title ?? null,
    accountName: opp.account?.name ?? null,
    leadStatus: null,
    opportunityStage: opp.stage,
    productLabel: productLabel(opp.product),
    relationshipStrength: primary?.relationshipStrength ? (RELATIONSHIP_STRENGTHS[primary.relationshipStrength] ?? primary.relationshipStrength) : null,
    sourceType: primary?.sourceType ?? null,
    sourceDetail: primary?.sourceDetail ?? null,
    acquisitionPath: null,
    referredByName: null,
    primaryContactName: primary ? `${primary.firstName} ${primary.lastName}` : null,
    opportunityContext: { name: opp.name, stage: opp.stage, value: opp.value, healthStatus: opp.healthStatus },
    notes: opp.notes,
    useCase: opp.useCase,
    lastInteractionDate: last ? toIso(last.date) : null,
    lastInteractionSummary: last ? `${last.type}: ${last.label}` : null,
    recentActivities,
    openTasks,
    nextDueTask: next ? { title: next.label, dueDate: toIso(next.date) } : null,
  };
}

/** Returns null when the entity does not exist — callers must 404 rather than fabricate context. */
export async function buildSalesContext(entityType: SalesCopilotEntityType, entityId: string): Promise<SalesContext | null> {
  switch (entityType) {
    case "LEAD":
      return buildFromLead(entityId);
    case "CONTACT":
      return buildFromContact(entityId);
    case "OPPORTUNITY":
      return buildFromOpportunity(entityId);
  }
}
