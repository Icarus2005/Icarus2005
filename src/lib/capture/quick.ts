import { normalizeName } from "@/lib/normalize";
import { isProductKey, type ProductKey } from "@/lib/products";

// A replaceable event preset, kept outside the CRM schema.
export const LIVE_X_CONTEXT = {
  name: "LiveX Abu Dhabi 2026",
  date: "2026-09-29",
  location: "Abu Dhabi, UAE",
  sourceType: "EVENT",
  acquisitionPath: "DIRECT_MEETING",
} as const;

export type QuickSuggestion = {
  personName: string | null;
  companyName: string | null;
  statedRole: string | null;
  productKey: ProductKey | null;
  conversationSummary: string | null;
  relationshipContext: string | null;
  theirCommitment: string | null;
  myCommitment: string | null;
  nextAction: string | null;
  dueDate: string | null;
  notes: string | null;
  evidenceByField: Record<string, string | null>;
};

export const QUICK_SUGGESTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    personName: { type: ["string", "null"] },
    companyName: { type: ["string", "null"] },
    statedRole: { type: ["string", "null"] },
    productKey: { type: ["string", "null"] },
    conversationSummary: { type: ["string", "null"] },
    relationshipContext: { type: ["string", "null"] },
    theirCommitment: { type: ["string", "null"] },
    myCommitment: { type: ["string", "null"] },
    nextAction: { type: ["string", "null"] },
    dueDate: { type: ["string", "null"] },
    notes: { type: ["string", "null"] },
    evidenceByField: {
      type: "object", additionalProperties: false,
      properties: {
        personName: { type: "string" }, companyName: { type: "string" },
        statedRole: { type: "string" }, productKey: { type: "string" },
        theirCommitment: { type: "string" }, myCommitment: { type: "string" },
        nextAction: { type: "string" }, dueDate: { type: "string" },
      },
      required: ["personName", "companyName", "statedRole", "productKey", "theirCommitment", "myCommitment", "nextAction", "dueDate"],
    },
  },
  required: ["personName", "companyName", "statedRole", "productKey", "conversationSummary", "relationshipContext", "theirCommitment", "myCommitment", "nextAction", "dueDate", "notes", "evidenceByField"],
} as const;

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function resolveDueDate(transcript: string, today = new Date()): string | null {
  const text = transcript.toLowerCase();
  const localToday = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(today) + "T12:00:00Z");
  let offset: number | null = null;
  if (/\b(next week)\b/.test(text)) {
    offset = ((8 - localToday.getUTCDay()) % 7) || 7;
  } else if (/\btomorrow\b/.test(text)) {
    offset = 1;
  } else {
    const weekday = WEEKDAYS.findIndex((day) => new RegExp(`\\b(?:follow\\s?up(?: on)?|by|next)\\s+${day}\\b`).test(text));
    if (weekday >= 0) offset = ((weekday - localToday.getUTCDay() + 7) % 7) || 7;
  }
  if (offset === null) return null;
  localToday.setUTCDate(localToday.getUTCDate() + offset);
  return localToday.toISOString().slice(0, 10);
}

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 2000) : null;
}

export function sanitizeSuggestion(raw: unknown, transcript: string, today = new Date()): QuickSuggestion {
  const data = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const evidence = data.evidenceByField && typeof data.evidenceByField === "object" ? data.evidenceByField as Record<string, unknown> : {};
  const personName = clean(data.personName);
  const companyName = clean(data.companyName);
  const product = clean(data.productKey)?.toUpperCase();
  const grounded = (value: string | null, source: string | null) => value && source && normalizeName(transcript).includes(normalizeName(source)) ? value : null;
  return {
    personName: grounded(personName, personName),
    companyName: grounded(companyName, companyName),
    statedRole: grounded(clean(data.statedRole), clean(data.statedRole)),
    productKey: product && isProductKey(product) && normalizeName(transcript).includes(normalizeName(product === "PLACEPULSE" ? "PlacePulse" : product)) ? product : null,
    conversationSummary: clean(data.conversationSummary),
    relationshipContext: clean(data.relationshipContext),
    theirCommitment: grounded(clean(data.theirCommitment), clean(evidence.theirCommitment)),
    myCommitment: grounded(clean(data.myCommitment), clean(evidence.myCommitment)),
    nextAction: clean(data.nextAction),
    dueDate: resolveDueDate(transcript, today),
    notes: clean(data.notes),
    evidenceByField: Object.fromEntries(Object.entries(evidence).map(([key, value]) => [key, clean(value)])),
  };
}
