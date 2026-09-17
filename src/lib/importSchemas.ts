// Single source of truth for CSV import column lists. The downloadable
// templates, the "Column Reference" panel and the parsing in
// src/app/import/page.tsx all read from here, and the backend routes under
// src/app/api/import/* accept exactly these fields (plus the legacy `source`
// alias on leads, kept for back-compat — see src/lib/leadImport.ts). Keeping
// one shared list prevents the template, the UI copy and the backend
// validation from drifting apart.

export const IMPORT_COLUMNS = {
  accounts: ["name", "country", "sector", "industry", "size", "tier", "ownerEmail", "website", "description"],
  contacts: ["firstName", "lastName", "accountName", "email", "phone", "title", "role"],
  leads: [
    "name",
    "company",
    "title",
    "email",
    "phone",
    "primaryProduct",
    "secondaryProducts",
    "markets",
    "sourceType",
    "sourceDetail",
    "salesMotion",
    "useCase",
    "status",
    "score",
    "estimatedValue",
    "ownerEmail",
    "notes",
  ],
  opportunities: [
    "name",
    "accountName",
    "product",
    "stage",
    "value",
    "probability",
    "markets",
    "ownerEmail",
    "expectedCloseDate",
    "useCase",
    "nextAction",
    "nextActionDate",
    "notes",
  ],
} as const;

export type ImportEntity = keyof typeof IMPORT_COLUMNS;

// Columns that only ever appear on one entity's template. Used to detect a
// CSV uploaded into the wrong importer (e.g. a Contacts export dropped into
// the Accounts tab) before any row is parsed for real. `accountName` is
// deliberately excluded — it's shared between contacts and opportunities,
// so it can't distinguish either from the other.
const DISTINCTIVE_COLUMNS: Record<ImportEntity, string[]> = {
  accounts: ["country", "sector", "industry", "tier", "website", "description"],
  contacts: ["firstName", "lastName"],
  leads: ["primaryProduct", "secondaryProducts", "sourceType", "sourceDetail", "salesMotion", "score", "estimatedValue"],
  opportunities: ["stage", "probability", "expectedCloseDate", "nextAction", "nextActionDate"],
};

const REQUIRED_COLUMNS: Record<ImportEntity, string[]> = {
  accounts: ["name"],
  contacts: ["firstName", "lastName"],
  leads: ["name"],
  opportunities: ["name", "accountName"],
};

const ENTITY_LABELS: Record<ImportEntity, string> = {
  accounts: "Accounts",
  contacts: "Contacts",
  leads: "Leads",
  opportunities: "Opportunities",
};

function mismatchMessage(entity: ImportEntity): string {
  const label = ENTITY_LABELS[entity];
  const article = /^[AEIOU]/.test(label) ? "an" : "a";
  return `This appears to be ${article} ${label} CSV. Switch to ${label} to import it.`;
}

/**
 * Returns a human-readable blocking message if `headers` structurally look
 * like the wrong entity for the selected importer `tab`, or if a column the
 * tab genuinely requires is absent. Returns null when the shape is fine —
 * callers must not create any records when this returns non-null.
 */
export function detectHeaderMismatch(tab: ImportEntity, headers: string[]): string | null {
  const headerSet = new Set(headers.map((h) => h.trim()));

  const scores = (Object.keys(DISTINCTIVE_COLUMNS) as ImportEntity[]).map((entity) => ({
    entity,
    score: DISTINCTIVE_COLUMNS[entity].filter((c) => headerSet.has(c)).length,
  }));
  const tabScore = scores.find((s) => s.entity === tab)!.score;
  const best = scores.reduce((a, b) => (b.score > a.score ? b : a));

  // The file scores meaningfully higher for a different entity than for the
  // one selected — almost certainly the wrong CSV, regardless of whether a
  // same-named column (like `name`) happens to also exist on both.
  if (best.entity !== tab && best.score >= 2 && best.score > tabScore) {
    return mismatchMessage(best.entity);
  }

  const missingRequired = REQUIRED_COLUMNS[tab].filter((c) => !headerSet.has(c));
  if (missingRequired.length > 0) {
    if (best.entity !== tab && best.score > 0) {
      return mismatchMessage(best.entity);
    }
    return `Missing required column${missingRequired.length > 1 ? "s" : ""}: ${missingRequired.join(", ")}.`;
  }

  return null;
}
