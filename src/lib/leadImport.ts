// Pure resolution logic for structured lead source (sourceType/sourceDetail)
// and the extensible useCase field, shared by the Leads and Opportunities
// CSV import routes. No database access, so it is unit tested directly.

import { LEAD_SOURCE_TYPES, USE_CASES } from "./constants";

export const VALID_SOURCE_TYPES = Object.keys(LEAD_SOURCE_TYPES);

export type SourceResolution = { sourceType: string | null; warning: string | null };

/**
 * sourceType is a fixed, controlled set — an unrecognized value is still
 * imported as-is (nothing is silently dropped) but flagged for review.
 * Falls back to the legacy flat `source` column when `sourceType` isn't
 * supplied, for CSVs exported before this change.
 */
export function resolveLeadSource(
  row: { sourceType?: string; source?: string },
  leadName: string
): SourceResolution {
  const sourceType = (row.sourceType?.trim() || row.source?.trim() || "").toUpperCase() || null;
  if (sourceType && !VALID_SOURCE_TYPES.includes(sourceType)) {
    return {
      sourceType,
      warning: `Lead "${leadName}": unrecognized sourceType "${sourceType}" — imported as-is, review manually. Valid types: ${VALID_SOURCE_TYPES.join(", ")}`,
    };
  }
  return { sourceType, warning: null };
}

export type UseCaseResolution = { useCase: string | null; warning: string | null };

/**
 * useCase is deliberately extensible (not a hard enum) so it can carry
 * product-specific context (PlacePulse, Plymio, AI Navigator, Advisory)
 * without a schema change. An unrecognized value is kept, just flagged.
 */
export function resolveUseCase(raw: string | undefined, entityLabel: string): UseCaseResolution {
  const useCaseRaw = raw?.trim() || null;
  const useCase = useCaseRaw ? useCaseRaw.toUpperCase() : null;
  if (useCase && !(useCase in USE_CASES)) {
    return {
      useCase,
      warning: `${entityLabel}: use case "${useCaseRaw}" is not in the suggested list — imported as-is.`,
    };
  }
  return { useCase, warning: null };
}
