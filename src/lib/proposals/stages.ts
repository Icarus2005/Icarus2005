// Proposal pipeline stage definitions — mirrors the event-driven architecture:
// triage (cheap) → analyse → research → write → format → human review → deliver.

export const PROPOSAL_STAGES = [
  "QUEUED",
  "ANALYZING",
  "RESEARCHING",
  "DRAFTING",
  "FORMATTING",
  "REVIEW",
  "APPROVED",
  "DELIVERED",
  "ARCHIVED",
] as const;

export type ProposalStage = (typeof PROPOSAL_STAGES)[number];

export type StageMeta = {
  key: ProposalStage;
  label: string;
  /** What the automated step does; empty for human/terminal stages. */
  description: string;
  /** True when the pipeline runner can advance this stage automatically. */
  automated: boolean;
  badge: string;
};

export const STAGE_META: Record<ProposalStage, StageMeta> = {
  QUEUED: {
    key: "QUEUED",
    label: "Queued",
    description: "Waiting for the pipeline to pick it up",
    automated: true,
    badge: "bg-gray-100 text-gray-600",
  },
  ANALYZING: {
    key: "ANALYZING",
    label: "Analyzing Transcript",
    description: "Extracting requirements, pain points and scope from the call",
    automated: true,
    badge: "bg-indigo-100 text-indigo-700",
  },
  RESEARCHING: {
    key: "RESEARCHING",
    label: "Client Research",
    description: "Assembling account context from the CRM",
    automated: true,
    badge: "bg-sky-100 text-sky-700",
  },
  DRAFTING: {
    key: "DRAFTING",
    label: "Drafting",
    description: "Writing the proposal body",
    automated: true,
    badge: "bg-purple-100 text-purple-700",
  },
  FORMATTING: {
    key: "FORMATTING",
    label: "Formatting",
    description: "Producing the final client-ready document",
    automated: true,
    badge: "bg-violet-100 text-violet-700",
  },
  REVIEW: {
    key: "REVIEW",
    label: "Human Review",
    description: "Awaiting a person to approve before anything is sent",
    automated: false,
    badge: "bg-amber-100 text-amber-700",
  },
  APPROVED: {
    key: "APPROVED",
    label: "Approved",
    description: "Signed off — ready to deliver into the CRM",
    automated: false,
    badge: "bg-emerald-100 text-emerald-700",
  },
  DELIVERED: {
    key: "DELIVERED",
    label: "Delivered",
    description: "Opportunity created/linked in the CRM",
    automated: false,
    badge: "bg-green-100 text-green-700",
  },
  ARCHIVED: {
    key: "ARCHIVED",
    label: "Archived",
    description: "Closed without delivery",
    automated: false,
    badge: "bg-gray-100 text-gray-500",
  },
};

/** Stages shown as columns on the proposal board, in order. */
export const BOARD_STAGES: ProposalStage[] = [
  "QUEUED",
  "ANALYZING",
  "RESEARCHING",
  "DRAFTING",
  "FORMATTING",
  "REVIEW",
  "APPROVED",
  "DELIVERED",
];

/** The next stage the automated runner should move into, or null if it stops. */
export function nextStage(stage: string): ProposalStage | null {
  const order: ProposalStage[] = [
    "QUEUED",
    "ANALYZING",
    "RESEARCHING",
    "DRAFTING",
    "FORMATTING",
    "REVIEW",
  ];
  const i = order.indexOf(stage as ProposalStage);
  if (i === -1 || i === order.length - 1) return null;
  return order[i + 1];
}

export function isProposalStage(v: string): v is ProposalStage {
  return (PROPOSAL_STAGES as readonly string[]).includes(v);
}

export const TRIAGE_STATUSES: Record<string, string> = {
  PENDING: "Pending triage",
  QUALIFIED: "Qualified",
  SKIPPED: "Skipped",
  FAILED: "Failed",
};

export const TRIAGE_COLORS: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-600",
  QUALIFIED: "bg-green-100 text-green-700",
  SKIPPED: "bg-gray-100 text-gray-500",
  FAILED: "bg-red-100 text-red-700",
};

export const TRANSCRIPT_SOURCES: Record<string, string> = {
  FATHOM: "Fathom",
  FIREFLIES: "Fireflies",
  WEBHOOK: "Webhook",
  MANUAL: "Manual",
};
