// ─── ArqOne product taxonomy ─────────────────────────────────────────────────
// Single source of truth for product metadata and pipeline templates.
// Canonical keys are stored in the database; labels are display-only.

export const PRODUCT_KEYS = [
  "PLACEPULSE",
  "PLYMIO",
  "AI_NAVIGATOR",
  "ADVISORY",
  "UNASSIGNED",
] as const;

export type ProductKey = (typeof PRODUCT_KEYS)[number];

export type ProductMeta = {
  key: ProductKey;
  label: string;
  slug: string; // used in /workspace/[slug] URLs
  description: string;
  // Restrained accents inside the shared ArqOne design system
  badge: string; // badge classes
  dot: string; // small dot / bar accent
  text: string; // accent text
  soft: string; // soft background accent
};

export const PRODUCTS_META: Record<ProductKey, ProductMeta> = {
  PLACEPULSE: {
    key: "PLACEPULSE",
    label: "PlacePulse",
    slug: "placepulse",
    description: "Location Intelligence and Decision Intelligence opportunities",
    badge: "bg-brand-100 text-brand-700",
    dot: "bg-brand-500",
    text: "text-brand-600",
    soft: "bg-brand-50",
  },
  PLYMIO: {
    key: "PLYMIO",
    label: "Plymio",
    slug: "plymio",
    description: "AI coaching marketplace and executive development",
    badge: "bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-500",
    text: "text-emerald-600",
    soft: "bg-emerald-50",
  },
  AI_NAVIGATOR: {
    key: "AI_NAVIGATOR",
    label: "AI Navigator",
    slug: "ai-navigator",
    description: "Executive AI fluency and enterprise adoption programmes",
    badge: "bg-amber-100 text-amber-700",
    dot: "bg-amber-500",
    text: "text-amber-600",
    soft: "bg-amber-50",
  },
  ADVISORY: {
    key: "ADVISORY",
    label: "ArqOne Advisory",
    slug: "advisory",
    description: "AI efficiency audits, operating models and governance",
    badge: "bg-violet-100 text-violet-700",
    dot: "bg-violet-500",
    text: "text-violet-600",
    soft: "bg-violet-50",
  },
  UNASSIGNED: {
    key: "UNASSIGNED",
    label: "Unassigned",
    slug: "unassigned",
    description: "Records awaiting product classification",
    badge: "bg-gray-100 text-gray-600",
    dot: "bg-gray-400",
    text: "text-gray-500",
    soft: "bg-gray-50",
  },
};

// Business lines shown in navigation / selectors (ordered), excluding UNASSIGNED
export const BUSINESS_LINES: ProductKey[] = [
  "PLACEPULSE",
  "PLYMIO",
  "AI_NAVIGATOR",
  "ADVISORY",
];

export const ALL_PRODUCT_KEYS: ProductKey[] = [...BUSINESS_LINES, "UNASSIGNED"];

export function isProductKey(v: string | null | undefined): v is ProductKey {
  return !!v && (PRODUCT_KEYS as readonly string[]).includes(v);
}

export function productLabel(key: string | null | undefined): string {
  if (!key) return PRODUCTS_META.UNASSIGNED.label;
  return PRODUCTS_META[key as ProductKey]?.label ?? key;
}

export function productBySlug(slug: string): ProductMeta | undefined {
  return Object.values(PRODUCTS_META).find((p) => p.slug === slug);
}

/** Parse a ?product= query value into a canonical key, or null for "all". */
export function parseProductParam(v: string | string[] | undefined): ProductKey | null {
  const s = Array.isArray(v) ? v[0] : v;
  if (!s || s === "ALL") return null;
  return isProductKey(s) ? s : null;
}

/** Split a comma-separated product list into valid keys. */
export function parseProductList(v: string | null | undefined): ProductKey[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(isProductKey);
}

// ─── Sales motions ───────────────────────────────────────────────────────────

export const SALES_MOTIONS: Record<string, string> = {
  DIRECT: "Direct",
  PARTNER: "Partner",
  REFERRAL: "Referral",
  INVESTOR: "Investor",
  INBOUND: "Inbound",
  OUTBOUND: "Outbound",
  EVENT: "Event",
  EXISTING_RELATIONSHIP: "Existing Relationship",
  OTHER: "Other",
};

// ─── Forecast & health ───────────────────────────────────────────────────────

export const FORECAST_CATEGORIES: Record<string, string> = {
  PIPELINE: "Pipeline",
  BEST_CASE: "Best Case",
  COMMIT: "Commit",
  CLOSED: "Closed",
};

export const HEALTH_STATUSES: Record<string, string> = {
  ON_TRACK: "On Track",
  AT_RISK: "At Risk",
  STALLED: "Stalled",
};

export const HEALTH_COLORS: Record<string, string> = {
  ON_TRACK: "bg-green-100 text-green-700",
  AT_RISK: "bg-amber-100 text-amber-700",
  STALLED: "bg-red-100 text-red-700",
};

// ─── Pipeline templates ──────────────────────────────────────────────────────
// Seeded into the Pipeline / PipelineStage tables with deterministic ids.
// Stage keys are canonical; names are display labels.

export type StageTemplate = {
  key: string;
  name: string;
  probability: number;
  isWon?: boolean;
  isLost?: boolean;
};

export type PipelineTemplate = {
  id: string; // deterministic pipeline id
  name: string;
  productKey: ProductKey;
  stages: StageTemplate[];
};

const CLOSED: StageTemplate[] = [
  { key: "CLOSED_WON", name: "Closed Won", probability: 100, isWon: true },
  { key: "CLOSED_LOST", name: "Closed Lost", probability: 0, isLost: true },
];

export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  {
    id: "pl_placepulse",
    name: "PlacePulse Sales",
    productKey: "PLACEPULSE",
    stages: [
      { key: "IDENTIFIED", name: "Identified", probability: 5 },
      { key: "QUALIFIED", name: "Qualified", probability: 15 },
      { key: "DISCOVERY", name: "Discovery", probability: 25 },
      { key: "DATA_SCOPING", name: "Evidence & Data Scoping", probability: 35 },
      { key: "PILOT", name: "Pilot / POC", probability: 50 },
      { key: "PROPOSAL", name: "Proposal", probability: 65 },
      { key: "NEGOTIATION", name: "Negotiation", probability: 80 },
      ...CLOSED,
    ],
  },
  {
    id: "pl_plymio",
    name: "Plymio Sales",
    productKey: "PLYMIO",
    stages: [
      { key: "IDENTIFIED", name: "Identified", probability: 5 },
      { key: "QUALIFIED", name: "Qualified", probability: 15 },
      { key: "DISCOVERY", name: "Discovery", probability: 25 },
      { key: "SOLUTION_FIT", name: "Solution Fit", probability: 35 },
      { key: "PILOT", name: "Pilot / Demo", probability: 50 },
      { key: "PROPOSAL", name: "Proposal", probability: 65 },
      { key: "COMMERCIAL_REVIEW", name: "Commercial Review", probability: 80 },
      ...CLOSED,
    ],
  },
  {
    id: "pl_ai_navigator",
    name: "AI Navigator Sales",
    productKey: "AI_NAVIGATOR",
    stages: [
      { key: "IDENTIFIED", name: "Identified", probability: 5 },
      { key: "QUALIFIED", name: "Qualified", probability: 15 },
      { key: "EXEC_DISCOVERY", name: "Executive Discovery", probability: 25 },
      { key: "USE_CASE_SCOPING", name: "Use Case Scoping", probability: 35 },
      { key: "PROGRAMME_DESIGN", name: "Programme Design", probability: 50 },
      { key: "PROPOSAL", name: "Proposal", probability: 65 },
      { key: "PROCUREMENT", name: "Procurement", probability: 80 },
      ...CLOSED,
    ],
  },
  {
    id: "pl_advisory",
    name: "Advisory Engagements",
    productKey: "ADVISORY",
    stages: [
      { key: "IDENTIFIED", name: "Identified", probability: 5 },
      { key: "DISCOVERY", name: "Discovery", probability: 15 },
      { key: "DIAGNOSTIC_SCOPED", name: "Diagnostic Scoped", probability: 30 },
      { key: "WORKSHOP_AUDIT", name: "Workshop / Audit", probability: 45 },
      { key: "PROPOSAL", name: "Proposal", probability: 60 },
      { key: "NEGOTIATION", name: "Negotiation", probability: 75 },
      { key: "ENGAGEMENT_CONFIRMED", name: "Engagement Confirmed", probability: 90 },
      ...CLOSED,
    ],
  },
  {
    id: "pl_unassigned",
    name: "General Pipeline",
    productKey: "UNASSIGNED",
    stages: [
      { key: "IDENTIFIED", name: "Identified", probability: 5 },
      { key: "QUALIFIED", name: "Qualified", probability: 20 },
      { key: "PROPOSAL", name: "Proposal", probability: 50 },
      { key: "NEGOTIATION", name: "Negotiation", probability: 75 },
      ...CLOSED,
    ],
  },
];

export function pipelineTemplateFor(productKey: string): PipelineTemplate {
  return (
    PIPELINE_TEMPLATES.find((p) => p.productKey === productKey) ??
    PIPELINE_TEMPLATES[PIPELINE_TEMPLATES.length - 1]
  );
}

export function stageIdFor(pipelineId: string, stageKey: string): string {
  return `st_${pipelineId.replace(/^pl_/, "")}_${stageKey.toLowerCase()}`;
}

// Maps legacy (pre-product-pipeline) stage keys to per-product stage keys.
export const LEGACY_STAGE_MAP: Record<string, string> = {
  IDENTIFIED: "IDENTIFIED",
  QUALIFIED: "QUALIFIED",
  DEMO_SCHEDULED: "PILOT",
  PROPOSAL_SENT: "PROPOSAL",
  NEGOTIATION: "NEGOTIATION",
  CLOSED_WON: "CLOSED_WON",
  CLOSED_LOST: "CLOSED_LOST",
};

/**
 * Effective product for a task/activity: opportunity product wins, then the
 * lead's primary product, then the record's own product field (used when the
 * record is linked only to an account/contact), else UNASSIGNED.
 */
export function inheritedProduct(rec: {
  product?: string | null;
  opportunity?: { product: string } | null;
  lead?: { primaryProduct: string } | null;
}): string {
  return (
    rec.opportunity?.product ??
    rec.lead?.primaryProduct ??
    rec.product ??
    "UNASSIGNED"
  );
}

/** Resolve a stage key against a template, falling back sensibly. */
export function resolveStageKey(template: PipelineTemplate, stageKey: string): string {
  const direct = template.stages.find((s) => s.key === stageKey);
  if (direct) return direct.key;
  const mapped = LEGACY_STAGE_MAP[stageKey];
  if (mapped && template.stages.some((s) => s.key === mapped)) return mapped;
  return template.stages[0].key;
}
