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
