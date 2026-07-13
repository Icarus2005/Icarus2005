import {
  PRODUCTS_META,
  ALL_PRODUCT_KEYS,
  PIPELINE_TEMPLATES,
} from "./products";

// ─── Markets ─────────────────────────────────────────────────────────────────

export const COUNTRIES: Record<string, string> = {
  AE: "United Arab Emirates (UAE)",
  SA: "Saudi Arabia (KSA)",
  QA: "Qatar",
  KW: "Kuwait",
  BH: "Bahrain",
  OM: "Oman",
  EG: "Egypt",
  JO: "Jordan",
  OTHER: "Other",
};

export const MARKET_SHORT: Record<string, string> = {
  AE: "UAE",
  SA: "KSA",
  QA: "QAT",
  KW: "KWT",
  BH: "BHR",
  OM: "OMN",
  EG: "EGY",
  JO: "JOR",
  OTHER: "Other",
};

// Back-compat alias (older pages import this name)
export const GCC_COUNTRIES = COUNTRIES;

export function parseMarkets(v: string | null | undefined): string[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s in COUNTRIES);
}

export function marketLabels(v: string | null | undefined): string {
  const codes = parseMarkets(v);
  if (codes.length === 0) return v ?? "—";
  return codes.map((c) => MARKET_SHORT[c] ?? c).join(", ");
}

// ─── Org taxonomy ────────────────────────────────────────────────────────────

export const SECTORS: Record<string, string> = {
  GOVERNMENT: "Government",
  SEMI_GOVERNMENT: "Semi-Government",
  PRIVATE: "Private",
};

export const COMPANY_SIZES: Record<string, string> = {
  SMALL: "Small",
  MEDIUM: "Medium",
  LARGE: "Large",
  ENTERPRISE: "Enterprise",
};

export const ACCOUNT_TIERS: Record<string, string> = {
  STRATEGIC: "Strategic",
  KEY: "Key",
  STANDARD: "Standard",
};

export const CONTACT_ROLES: Record<string, string> = {
  DECISION_MAKER: "Decision Maker",
  INFLUENCER: "Influencer",
  CHAMPION: "Champion",
  BLOCKER: "Blocker",
  OTHER: "Other",
};

// ─── Leads ───────────────────────────────────────────────────────────────────

export const LEAD_STATUSES: Record<string, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  DISQUALIFIED: "Disqualified",
};

export const LEAD_STATUS_COLORS: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-700",
  CONTACTED: "bg-yellow-100 text-yellow-700",
  QUALIFIED: "bg-green-100 text-green-700",
  DISQUALIFIED: "bg-gray-100 text-gray-500",
};

export const DIGITAL_MATURITY: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

export const LEAD_SOURCES: Record<string, string> = {
  REFERRAL: "Referral",
  EVENT: "Event / Conference",
  INBOUND: "Inbound",
  OUTBOUND: "Outbound",
  LINKEDIN: "LinkedIn",
  PARTNER: "Partner",
  OTHER: "Other",
};

// ─── Products (derived from the canonical catalog in products.ts) ───────────

export const PRODUCTS: Record<string, string> = Object.fromEntries(
  ALL_PRODUCT_KEYS.map((k) => [k, PRODUCTS_META[k].label])
);

// Back-compat alias (stored in Opportunity.product)
export const DEAL_TYPES = PRODUCTS;

// ─── Stages (union of all pipeline templates, for generic display) ──────────

export const STAGE_LABELS: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const t of PIPELINE_TEMPLATES) {
    for (const s of t.stages) out[s.key] = s.name;
  }
  // legacy keys that may still exist on old records
  out.DEMO_SCHEDULED = "Demo Scheduled";
  out.PROPOSAL_SENT = "Proposal Sent";
  return out;
})();

export const STAGE_COLORS: Record<string, string> = (() => {
  const out: Record<string, string> = {
    IDENTIFIED: "bg-gray-100 text-gray-700",
    QUALIFIED: "bg-blue-100 text-blue-700",
    DEMO_SCHEDULED: "bg-purple-100 text-purple-700",
    PROPOSAL_SENT: "bg-yellow-100 text-yellow-700",
  };
  for (const t of PIPELINE_TEMPLATES) {
    for (const s of t.stages) {
      if (out[s.key]) continue;
      if (s.isWon) out[s.key] = "bg-green-100 text-green-700";
      else if (s.isLost) out[s.key] = "bg-red-100 text-red-700";
      else if (s.probability >= 60) out[s.key] = "bg-orange-100 text-orange-700";
      else if (s.probability >= 35) out[s.key] = "bg-purple-100 text-purple-700";
      else out[s.key] = "bg-indigo-100 text-indigo-700";
    }
  }
  return out;
})();

export function stageColor(key: string | null | undefined): string {
  return (key && STAGE_COLORS[key]) || "bg-gray-100 text-gray-600";
}

// Back-compat alias
export const DEAL_STAGES = STAGE_LABELS;

// ─── Activities & Tasks ──────────────────────────────────────────────────────

export const ACTIVITY_TYPES: Record<string, string> = {
  MEETING: "Meeting",
  CALL: "Call",
  EMAIL: "Email",
  NOTE: "Note",
  DEMO: "Demo",
};

export const TASK_STATUSES: Record<string, string> = {
  OPEN: "Open",
  DONE: "Done",
};

export const TASK_PRIORITIES: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export const TASK_PRIORITY_COLORS: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-600",
  MEDIUM: "bg-blue-100 text-blue-700",
  HIGH: "bg-amber-100 text-amber-700",
  URGENT: "bg-red-100 text-red-700",
};

// ─── Team & Access ──────────────────────────────────────────────────────────

export const TEAM_ROLES: Record<string, string> = {
  SALES_DIRECTOR: "Sales Director",
  SALES_EXECUTIVE: "Sales Executive",
  VIEWER: "Viewer (Read-only)",
};
