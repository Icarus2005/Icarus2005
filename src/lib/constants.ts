export const COUNTRIES: Record<string, string> = {
  UAE: "UAE",
  SAUDI_ARABIA: "Saudi Arabia",
  QATAR: "Qatar",
  KUWAIT: "Kuwait",
  BAHRAIN: "Bahrain",
  OMAN: "Oman",
  EGYPT: "Egypt",
  JORDAN: "Jordan",
  TURKEY: "Turkey",
  OTHER: "Other",
};

// Back-compat alias (older pages import this name)
export const GCC_COUNTRIES = COUNTRIES;

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

// ─── Deals ───────────────────────────────────────────────────────────────────

export const DEAL_STAGES: Record<string, string> = {
  IDENTIFIED: "Identified",
  QUALIFIED: "Qualified",
  DEMO_SCHEDULED: "Demo Scheduled",
  PROPOSAL_SENT: "Proposal Sent",
  NEGOTIATION: "Negotiation",
  CLOSED_WON: "Closed Won",
  CLOSED_LOST: "Closed Lost",
};

export const DEAL_STAGE_ORDER = [
  "IDENTIFIED",
  "QUALIFIED",
  "DEMO_SCHEDULED",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "CLOSED_WON",
  "CLOSED_LOST",
];

export const OPEN_STAGES = [
  "IDENTIFIED",
  "QUALIFIED",
  "DEMO_SCHEDULED",
  "PROPOSAL_SENT",
  "NEGOTIATION",
];

export const STAGE_COLORS: Record<string, string> = {
  IDENTIFIED: "bg-gray-100 text-gray-700",
  QUALIFIED: "bg-blue-100 text-blue-700",
  DEMO_SCHEDULED: "bg-purple-100 text-purple-700",
  PROPOSAL_SENT: "bg-yellow-100 text-yellow-700",
  NEGOTIATION: "bg-orange-100 text-orange-700",
  CLOSED_WON: "bg-green-100 text-green-700",
  CLOSED_LOST: "bg-red-100 text-red-700",
};

// ArqOne product lines (stored in Opportunity.type)
export const DEAL_TYPES: Record<string, string> = {
  MAYA: "MAYA",
  METRICS_PRO: "Metrics Pro",
  CONSULTING: "Consulting",
  OTHER: "Other",
};

export const PRODUCTS = DEAL_TYPES;

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
