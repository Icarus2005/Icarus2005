/**
 * Shared exact-match name normalization — lowercase, strip punctuation,
 * collapse whitespace. Used for deterministic (never fuzzy) matching only.
 * Mirrors the normalizeName helper already duplicated in dataAudit.ts and
 * sprint03Reconcile.ts; new code should import this one instead of adding
 * a fourth copy.
 */
export function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
