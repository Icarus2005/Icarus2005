/**
 * Business card extraction (Sprint 06E.1).
 *
 * Reuses the existing Anthropic integration (src/lib/proposals/llm.ts) via
 * its new completeVision() helper — no new provider, no new dependency.
 * Uses TRIAGE_MODEL (Haiku), matching the codebase's existing cost split:
 * a cheap model for a bounded, high-volume, low-stakes extraction task.
 *
 * Vision output is a suggestion, never truth: this module never writes to
 * the CRM and the caller must let the user review/edit every field before
 * Quick Capture's existing Save button is used.
 */
import { completeVision, parseJsonBlock, TRIAGE_MODEL, llmConfigured } from "@/lib/proposals/llm";

export const ALLOWED_CARD_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type CardMimeType = (typeof ALLOWED_CARD_MIME_TYPES)[number];

export function isAllowedCardMimeType(v: unknown): v is CardMimeType {
  return typeof v === "string" && (ALLOWED_CARD_MIME_TYPES as readonly string[]).includes(v);
}

// A business card photo from a phone camera rarely needs to exceed this;
// kept well under typical serverless request-body ceilings once base64
// encoding adds its ~33% overhead.
export const MAX_CARD_IMAGE_BYTES = 4 * 1024 * 1024;

export function cardExtractionConfigured(): boolean {
  return llmConfigured();
}

const CARD_FIELDS = ["fullName", "company", "jobTitle", "email", "phone", "linkedinUrl"] as const;
type CardField = (typeof CARD_FIELDS)[number];

export type CardExtractResult = {
  fullName: string | null;
  company: string | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  confidence: Partial<Record<CardField, "high" | "medium" | "low">>;
};

const EMPTY_RESULT: CardExtractResult = {
  fullName: null,
  company: null,
  jobTitle: null,
  email: null,
  phone: null,
  linkedinUrl: null,
  confidence: {},
};

const SYSTEM = `You read a photo of a business card and extract only what is visibly printed on it.
Never invent, guess, or infer a value that is not actually on the card — if a field is missing,
unclear, or not present, set it to null rather than fabricating something plausible. Do not
infer a company from an email domain, or a job title from a logo, unless it is also printed as
text. Respond with a single JSON object only, no prose.`;

function buildPrompt(): string {
  return `Extract these fields from the business card photo:
{
  "fullName": "string or null",
  "company": "string or null",
  "jobTitle": "string or null",
  "email": "string or null",
  "phone": "string or null",
  "linkedinUrl": "string or null",
  "confidence": { "fullName": "high|medium|low", "company": "high|medium|low", ... only for fields you extracted a non-null value for }
}
Only include a field in "confidence" if you extracted a value for it — never guess a field you set to null.`;
}

function sanitize(result: CardExtractResult): CardExtractResult {
  const out: CardExtractResult = { ...EMPTY_RESULT, confidence: {} };
  for (const field of CARD_FIELDS) {
    const value = result[field];
    out[field] = typeof value === "string" && value.trim() ? value.trim() : null;
  }
  if (result.confidence && typeof result.confidence === "object") {
    for (const field of CARD_FIELDS) {
      const c = result.confidence[field];
      if (out[field] && (c === "high" || c === "medium" || c === "low")) out.confidence[field] = c;
    }
  }
  return out;
}

export type VisionCaller = typeof completeVision;

/**
 * Returns null when extraction genuinely failed (bad response, network
 * error, parse failure) — callers must not treat null as "empty card".
 * Callers should check cardExtractionConfigured() first to distinguish
 * "not configured" from "failed" for the user-facing error message.
 *
 * `visionCall` defaults to the real Anthropic vision call; tests inject a
 * fake so the suite never makes a live paid call.
 */
export async function extractCardFields(
  imageBase64: string,
  mediaType: CardMimeType,
  visionCall: VisionCaller = completeVision
): Promise<CardExtractResult | null> {
  const text = await visionCall({
    model: TRIAGE_MODEL,
    system: SYSTEM,
    prompt: buildPrompt(),
    imageBase64,
    mediaType,
    maxTokens: 600,
  });
  const parsed = parseJsonBlock<CardExtractResult>(text);
  if (!parsed) return null;
  return sanitize(parsed);
}
