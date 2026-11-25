export const ROUND_KEY = "brandsprk-preseed-2026";
export const TARGET_USD = 300_000;
export const ROUND_KEYS = ["brandsprk-preseed-2026", "placepulse-preseed-2026"] as const;
export type RoundKey = typeof ROUND_KEYS[number];
export const FUNDRAISING_ROUNDS: Record<RoundKey, { label: string; product: "BRANDSPRK" | "PLACEPULSE"; targetUsd: number; briefingUrl: string; description: string }> = {
  "brandsprk-preseed-2026": {
    label: "BrandSprk", product: "BRANDSPRK", targetUsd: TARGET_USD,
    briefingUrl: "https://www.brandsprk.io/invest",
    description: "AI-powered brand and creative decision platform",
  },
  "placepulse-preseed-2026": {
    label: "PlacePulse", product: "PLACEPULSE", targetUsd: 1_500_000,
    briefingUrl: "https://www.placepulse.io/invest",
    description: "Evidence-governed location decision intelligence",
  },
};
export function parseRoundKey(value: unknown): RoundKey {
  return choice(value, ROUND_KEYS, "fundraising round");
}
export function fundraisingRound(key: string) {
  return FUNDRAISING_ROUNDS[parseRoundKey(key)];
}

export const STATUSES = ["NOT_STARTED", "SUBMITTED_PREVIOUSLY", "NEEDS_QUALIFICATION", "CONTACTED", "REPLIED", "MEETING", "DILIGENCE", "COMMITTED", "REJECTED", "PAUSED", "HOLD"] as const;
export const PRIORITIES = ["Now", "Qualify", "Hold"] as const;
export const SEND_KINDS = ["INITIAL", "FOLLOWUP_1", "FOLLOWUP_2", "RESPONSE"] as const;
export type SendKind = typeof SEND_KINDS[number];
export type Draft = { id: string; subject: string; body: string; channel: string; condition: string };
export type ImportRow = { sourceKey: string; name: string; routeType: string; priority: string; status: string; nextAction: string; notes: string; evidence: string; source: string; sourceStatus: string; drafts: Draft[] };

export function requiredText(value: unknown, label: string, max = 20000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${label} is required (maximum ${max} characters).`);
  return value.trim();
}
export function choice<T extends string>(value: unknown, choices: readonly T[], label: string): T {
  if (!choices.includes(value as T)) throw new Error(`Invalid ${label}.`);
  return value as T;
}
function optionalText(value: unknown, label: string, max = 20000): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > max) throw new Error(`Invalid ${label}.`);
  return value.trim();
}
export function parseDrafts(value: unknown): Draft[] {
  if (!Array.isArray(value) || value.length > 20) throw new Error("drafts must be an array of at most 20 drafts.");
  const drafts = value.map(d => ({ id: requiredText(d?.id, "draft ID", 80), subject: requiredText(d?.subject, "subject", 500), body: requiredText(d?.body, "body"), channel: requiredText(d?.channel, "channel", 100), condition: optionalText(d?.condition, "condition") }));
  if (new Set(drafts.map(d => d.id)).size !== drafts.length) throw new Error("Duplicate draft IDs.");
  return drafts;
}
export function parseImport(value: unknown): ImportRow[] {
  if (!Array.isArray(value) || !value.length || value.length > 200) throw new Error("Import requires 1 to 200 rows.");
  const rows = value.map(r => ({
    sourceKey: requiredText(r?.sourceKey, "source key", 80), name: requiredText(r?.name, "name", 200), routeType: requiredText(r?.routeType, "route type", 100),
    priority: choice(r?.priority, PRIORITIES, "priority"),
    // Imports never claim a send, meeting, reply or investment occurred.
    status: choice(r?.status, ["NOT_STARTED", "SUBMITTED_PREVIOUSLY", "NEEDS_QUALIFICATION", "HOLD"], "import status"),
    nextAction: requiredText(r?.nextAction, "next action"), notes: optionalText(r?.notes, "notes"), evidence: optionalText(r?.evidence, "evidence"),
    source: requiredText(r?.source, "source", 500), sourceStatus: requiredText(r?.sourceStatus, "source status", 100), drafts: parseDrafts(r?.drafts),
  }));
  if (new Set(rows.map(r => r.sourceKey)).size !== rows.length) throw new Error("Duplicate source keys.");
  return rows;
}

/** Mon-Fri business days in Dubai; no holiday calendar is assumed. */
export function followupDate(sent: Date, days: number): Date {
  const dubai = new Date(sent.getTime() + 4 * 3600000);
  let remaining = days;
  while (remaining > 0) {
    dubai.setUTCDate(dubai.getUTCDate() + 1);
    if (![0, 6].includes(dubai.getUTCDay())) remaining--;
  }
  // 09:00 Dubai on the target business day.
  dubai.setUTCHours(5, 0, 0, 0);
  return dubai;
}
export function actualDate(value: unknown, now = new Date()): Date {
  const text = requiredText(value, "actual timestamp", 50);
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(text)) throw new Error("Timestamp must include a timezone.");
  const date = new Date(text);
  if (!Number.isFinite(date.getTime()) || date > now) throw new Error("An actual event cannot be in the future.");
  return date;
}
export function money(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 999999999999.99 || Math.abs(value * 100 - Math.round(value * 100)) > 0.001) throw new Error("USD amounts must be non-negative numbers with at most two decimal places.");
  return value;
}
