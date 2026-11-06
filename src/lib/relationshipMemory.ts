import { isOverdueDubai } from "./dubaiTime";
import { BUSINESS_LINES, isProductKey, parseProductList, productLabel } from "./products";

type DateValue = Date | string;

export type RelationshipTimelineEntry = {
  key: string;
  kind: "activity" | "meeting" | "proposal" | "email";
  label: string;
  title: string;
  detail: string | null;
  date: DateValue;
  href: string | null;
  provenance: string;
  product: string | null;
};

type TimelineInput = {
  activities: Array<{
    id: string;
    type: string;
    subject: string;
    notes: string | null;
    date: DateValue;
    href: string;
    provenance: string;
    product?: string | null;
  }>;
  meetings: Array<{
    id: string;
    title: string;
    meetingDate: DateValue;
    source: string;
    href: string;
    provenance: string;
    product?: string | null;
  }>;
  proposals: Array<{
    id: string;
    title: string;
    stage: string;
    createdAt: DateValue;
    href: string;
    provenance: string;
    product?: string | null;
  }>;
  emails?: Array<{
    id: string;
    direction: string;
    subject: string | null;
    providerSentAt: DateValue;
    replyState: string;
    replyBasis: string | null;
    provenance: string;
  }>;
};

/**
 * Combines existing source records for display only. Records remain Activities,
 * Meetings and Proposals; this function never backfills or converts history.
 */
export function buildRelationshipTimeline(input: TimelineInput): RelationshipTimelineEntry[] {
  const entries: RelationshipTimelineEntry[] = [
    ...input.activities.map((activity) => ({
      key: `activity:${activity.id}`,
      kind: "activity" as const,
      label: activity.type,
      title: activity.subject,
      detail: activity.notes,
      date: activity.date,
      href: activity.href,
      provenance: activity.provenance,
      product: activity.product ?? null,
    })),
    ...input.meetings.map((meeting) => ({
      key: `meeting:${meeting.id}`,
      kind: "meeting" as const,
      label: "Meeting",
      title: meeting.title,
      detail: `Source: ${meeting.source}`,
      date: meeting.meetingDate,
      href: meeting.href,
      provenance: meeting.provenance,
      product: meeting.product ?? null,
    })),
    ...input.proposals.map((proposal) => ({
      key: `proposal:${proposal.id}`,
      kind: "proposal" as const,
      label: "Proposal",
      title: proposal.title,
      detail: `Stage: ${proposal.stage}`,
      date: proposal.createdAt,
      href: proposal.href,
      provenance: proposal.provenance,
      product: proposal.product ?? null,
    })),
    ...(input.emails ?? []).map((email) => ({
      key: `email:${email.id}`,
      kind: "email" as const,
      label: email.direction === "INBOUND" ? "Email received" : "Email sent",
      title: email.subject ?? "(No subject)",
      detail: email.replyState === "CONFIRMED"
        ? `Confirmed reply · ${email.replyBasis ?? "verified evidence"}`
        : email.replyState === "REVIEW_REQUIRED"
          ? "Possible reply · review required"
          : "Mailbox metadata",
      date: email.providerSentAt,
      href: null,
      provenance: email.provenance,
      product: null,
    })),
  ];

  return Array.from(new Map(entries.map((entry) => [entry.key, entry])).values())
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || a.key.localeCompare(b.key));
}

export type ProductEvidence = {
  key: string;
  label: string;
  recordedRelationship: string | null;
  sources: string[];
};

type ProductEvidenceInput = {
  accountProducts?: Array<{ productKey: string; relationshipState: string }>;
  leads?: Array<{ primaryProduct: string; secondaryProducts?: string | null }>;
  opportunities?: Array<{ product: string }>;
  activities?: Array<{ product?: string | null; lead?: { primaryProduct: string } | null; opportunity?: { product: string } | null }>;
  tasks?: Array<{ product?: string | null; lead?: { primaryProduct: string } | null; opportunity?: { product: string } | null }>;
  meetings?: Array<{ detectedProduct?: string | null }>;
  proposals?: Array<{ product: string }>;
};

export function buildProductEvidence(input: ProductEvidenceInput): ProductEvidence[] {
  const evidence = new Map<string, { relationship: string | null; sources: Set<string> }>();
  const add = (key: string | null | undefined, source: string, relationship: string | null = null) => {
    if (!isProductKey(key) || key === "UNASSIGNED") return;
    const current = evidence.get(key) ?? { relationship: null, sources: new Set<string>() };
    current.sources.add(source);
    if (relationship) current.relationship = relationship;
    evidence.set(key, current);
  };

  for (const item of input.accountProducts ?? []) add(item.productKey, "Account product record", item.relationshipState);
  for (const lead of input.leads ?? []) {
    add(lead.primaryProduct, "Linked Lead (primary)");
    for (const secondary of parseProductList(lead.secondaryProducts)) add(secondary, "Linked Lead (secondary)");
  }
  for (const opportunity of input.opportunities ?? []) add(opportunity.product, "Linked Opportunity");
  for (const activity of input.activities ?? []) {
    add(activity.opportunity?.product ?? activity.lead?.primaryProduct ?? activity.product, "Recorded Activity");
  }
  for (const task of input.tasks ?? []) {
    add(task.opportunity?.product ?? task.lead?.primaryProduct ?? task.product, "Canonical Task");
  }
  for (const meeting of input.meetings ?? []) add(meeting.detectedProduct, "Meeting classification");
  for (const proposal of input.proposals ?? []) add(proposal.product, "Proposal");

  const order = new Map(BUSINESS_LINES.map((key, index) => [key, index]));
  return Array.from(evidence, ([key, item]) => ({
    key,
    label: productLabel(key),
    recordedRelationship: item.relationship,
    sources: Array.from(item.sources).sort(),
  })).sort((a, b) => (order.get(a.key as (typeof BUSINESS_LINES)[number]) ?? 99) - (order.get(b.key as (typeof BUSINESS_LINES)[number]) ?? 99));
}

export type RelationshipTaskRef = {
  id: string;
  title: string;
  status: string;
  dueDate: DateValue | null;
  clientCommitmentDate: DateValue | null;
  href: string;
  provenance: string;
};

export type LegacyNextActionRef = {
  label: string | null;
  date: DateValue | null;
  href: string;
  provenance: string;
};

export type RelationshipNextAction = {
  label: string;
  date: DateValue | null;
  clientCommitmentDate: DateValue | null;
  href: string;
  provenance: string;
  source: "task" | "legacy";
} | null;

export function deriveRelationshipNextAction(
  tasks: RelationshipTaskRef[],
  legacyCandidates: LegacyNextActionRef[] = []
): RelationshipNextAction {
  const openTasks = tasks.filter((task) => task.status === "OPEN");
  const nearestTask = [...openTasks].sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return a.title.localeCompare(b.title);
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  })[0];
  if (nearestTask) {
    return {
      label: nearestTask.title,
      date: nearestTask.dueDate,
      clientCommitmentDate: nearestTask.clientCommitmentDate,
      href: nearestTask.href,
      provenance: nearestTask.provenance,
      source: "task",
    };
  }

  const legacy = legacyCandidates
    .filter((candidate) => candidate.label)
    .sort((a, b) => {
      if (!a.date && !b.date) return (a.label ?? "").localeCompare(b.label ?? "");
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    })[0];
  if (!legacy?.label) return null;
  return {
    label: legacy.label,
    date: legacy.date,
    clientCommitmentDate: null,
    href: legacy.href,
    provenance: legacy.provenance,
    source: "legacy",
  };
}

export function relationshipTaskConditions(task: Pick<RelationshipTaskRef, "status" | "dueDate" | "clientCommitmentDate">, now = new Date()) {
  if (task.status !== "OPEN") return [] as string[];
  const conditions: string[] = [];
  if (isOverdueDubai(task.clientCommitmentDate, now)) conditions.push("OVERDUE_COMMITMENT");
  if (isOverdueDubai(task.dueDate, now)) conditions.push("OVERDUE_INTERNAL");
  if (!task.dueDate) conditions.push("NEEDS_SCHEDULING");
  return conditions;
}
