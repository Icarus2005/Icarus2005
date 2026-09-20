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
  ENGAGED: "Engaged",
  QUALIFIED: "Qualified",
  DISQUALIFIED: "Disqualified",
};

export const LEAD_STATUS_COLORS: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-700",
  CONTACTED: "bg-yellow-100 text-yellow-700",
  ENGAGED: "bg-teal-100 text-teal-700",
  QUALIFIED: "bg-green-100 text-green-700",
  DISQUALIFIED: "bg-gray-100 text-gray-500",
};

// CONVERTED is never a stored Lead.status value — it's derived from
// convertedOpportunityId being non-null, so storage and display can never
// drift apart. Use this everywhere the UI needs to *display* lead status.
export function displayLeadStatus(lead: { status: string; convertedOpportunityId?: string | null }): string {
  return lead.convertedOpportunityId ? "CONVERTED" : lead.status;
}

export const LEAD_STATUS_LABELS_WITH_CONVERTED: Record<string, string> = {
  ...LEAD_STATUSES,
  CONVERTED: "Converted",
};

export const LEAD_STATUS_COLORS_WITH_CONVERTED: Record<string, string> = {
  ...LEAD_STATUS_COLORS,
  CONVERTED: "bg-violet-100 text-violet-700",
};

// ─── Contact relationship & provenance ──────────────────────────────────────
// Distinct from CONTACT_ROLES (organizational/buying authority) above — a
// contact's relationship warmth is tracked independently so, e.g., an
// internal connector with no buying authority isn't forced into a Champion/
// Decision Maker bucket just to reflect that they're a warm relationship.
export const RELATIONSHIP_STRENGTHS: Record<string, string> = {
  COLD: "Cold",
  REFERRED: "Referred",
  MET: "Met",
  ENGAGED: "Engaged",
  INTERNAL_CONNECTOR: "Internal Connector",
  POTENTIAL_CHAMPION: "Potential Champion",
  CHAMPION: "Champion",
};

export const RELATIONSHIP_STRENGTH_COLORS: Record<string, string> = {
  COLD: "bg-gray-100 text-gray-500",
  REFERRED: "bg-sky-100 text-sky-700",
  MET: "bg-blue-100 text-blue-700",
  ENGAGED: "bg-teal-100 text-teal-700",
  INTERNAL_CONNECTOR: "bg-indigo-100 text-indigo-700",
  POTENTIAL_CHAMPION: "bg-amber-100 text-amber-700",
  CHAMPION: "bg-green-100 text-green-700",
};

export const ACQUISITION_PATHS: Record<string, string> = {
  DIRECT_MEETING: "Direct Meeting",
  INTERNAL_REFERRAL: "Internal Referral",
  STAND_REFERRAL: "Stand Referral",
  CARD_PROVIDED: "Card Provided",
  INTRODUCTION: "Introduction",
  COLD_TARGET: "Cold Target",
  EXISTING_RELATIONSHIP: "Existing Relationship",
};

// ─── Opportunity type ────────────────────────────────────────────────────────
// Independent of pipeline stage — a Strategic Partnership opportunity still
// moves through the same PlacePulse stage list as a Commercial one.
export const OPPORTUNITY_TYPES: Record<string, string> = {
  COMMERCIAL: "Commercial",
  STRATEGIC_PARTNERSHIP: "Strategic Partnership",
  DATA_API_PARTNERSHIP: "Data / API Partnership",
  REFERRAL_ECOSYSTEM: "Referral / Ecosystem",
  OTHER: "Other",
};

export const OPPORTUNITY_TYPE_COLORS: Record<string, string> = {
  COMMERCIAL: "bg-blue-100 text-blue-700",
  STRATEGIC_PARTNERSHIP: "bg-violet-100 text-violet-700",
  DATA_API_PARTNERSHIP: "bg-indigo-100 text-indigo-700",
  REFERRAL_ECOSYSTEM: "bg-teal-100 text-teal-700",
  OTHER: "bg-gray-100 text-gray-600",
};

// ─── Account ↔ Product relationship state ───────────────────────────────────
// Set explicitly by a user action — never inferred merely from a Lead or
// Contact existing for that product/account pairing.
export const ACCOUNT_PRODUCT_STATES: Record<string, string> = {
  PROSPECT: "Prospect",
  ENGAGED: "Engaged",
  OPPORTUNITY: "Opportunity",
  CUSTOMER: "Customer",
  PARTNER_PROSPECT: "Partner Prospect",
  PARTNER: "Partner",
  DORMANT: "Dormant",
};

export const ACCOUNT_PRODUCT_STATE_COLORS: Record<string, string> = {
  PROSPECT: "bg-gray-100 text-gray-600",
  ENGAGED: "bg-teal-100 text-teal-700",
  OPPORTUNITY: "bg-blue-100 text-blue-700",
  CUSTOMER: "bg-green-100 text-green-700",
  PARTNER_PROSPECT: "bg-amber-100 text-amber-700",
  PARTNER: "bg-violet-100 text-violet-700",
  DORMANT: "bg-gray-100 text-gray-400",
};

export const DIGITAL_MATURITY: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

// Structured lead provenance (Lead.sourceType + free-text Lead.sourceDetail,
// e.g. sourceType=EVENT, sourceDetail="ATM Dubai 2026"). Distinct from
// SALES_MOTIONS in products.ts, which answers "how do we sell it" rather than
// "where did it come from". LEAD_SOURCES is kept as the export name for
// back-compat with the legacy flat Lead.source field, which is read-only now.
export const LEAD_SOURCES: Record<string, string> = {
  EVENT: "Event / Conference",
  REFERRAL: "Referral",
  INBOUND: "Inbound",
  OUTBOUND: "Outbound",
  PARTNER: "Partner",
  EXISTING_RELATIONSHIP: "Existing Relationship",
  LINKEDIN: "LinkedIn",
  WEBSITE: "Website",
  OTHER: "Other",
};

// Alias used going forward for the structured Lead.sourceType field.
export const LEAD_SOURCE_TYPES = LEAD_SOURCES;

// ─── Use case / context ──────────────────────────────────────────────────────
// Suggested values for Lead.useCase / Opportunity.useCase — a controlled but
// extensible string, not a hard enum: these are suggestions surfaced in the
// UI and used to flag unrecognized values on import, but any free-text value
// is accepted so the field can extend across every product (PlacePulse,
// Plymio, AI Navigator, Advisory) without a schema change or a new column on
// Account/Contact.
export const USE_CASES: Record<string, string> = {
  AIRPORT_INTELLIGENCE: "Airport Intelligence",
  DESTINATION_INTELLIGENCE: "Destination Intelligence",
  HOSPITALITY_INTELLIGENCE: "Hospitality Intelligence",
  RETAIL_INTELLIGENCE: "Mall / Retail Intelligence",
  MOBILITY_VISITATION: "Mobility / Visitation",
  CONSUMER_SPEND_INTELLIGENCE: "Consumer / Spend Intelligence",
  CUSTOMER_EXPERIENCE: "Customer Experience",
  PUBLIC_SENTIMENT: "Public Feedback / Sentiment",
  COMPETITIVE_LOCATION_INTELLIGENCE: "Competitive / Location Intelligence",
  PARTNERSHIP_DATA_OPPORTUNITY: "Partnership / Data Opportunity",
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
  WHATSAPP: "WhatsApp",
  LINKEDIN: "LinkedIn",
  DEMO: "Demo",
  EVENT_INTERACTION: "Event",
  REFERRAL: "Referral",
  NOTE: "Note",
  OTHER: "Other",
};

export const ACTIVITY_TYPE_COLORS: Record<string, string> = {
  MEETING: "bg-blue-100 text-blue-700",
  CALL: "bg-green-100 text-green-700",
  EMAIL: "bg-yellow-100 text-yellow-700",
  WHATSAPP: "bg-emerald-100 text-emerald-700",
  LINKEDIN: "bg-sky-100 text-sky-700",
  DEMO: "bg-purple-100 text-purple-700",
  EVENT_INTERACTION: "bg-indigo-100 text-indigo-700",
  REFERRAL: "bg-amber-100 text-amber-700",
  NOTE: "bg-gray-100 text-gray-700",
  OTHER: "bg-gray-100 text-gray-500",
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
