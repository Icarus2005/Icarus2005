/**
 * Business card extraction (Sprint 06E.1; diagnostics hardened in the
 * 06E.1 production-diagnosis follow-up).
 *
 * Reuses the existing Anthropic integration (src/lib/proposals/llm.ts) via
 * its completeVision() helper — no new provider, no new dependency.
 * Uses TRIAGE_MODEL (Haiku), matching the codebase's existing cost split:
 * a cheap model for a bounded, high-volume, low-stakes extraction task.
 *
 * Vision output is a suggestion, never truth: this module never writes to
 * the CRM and the caller must let the user review/edit every field before
 * Quick Capture's existing Save button is used.
 */
import { completeVision, parseJsonBlock, TRIAGE_MODEL, type VisionCallResult, type VisionErrorKind } from "@/lib/proposals/llm";

export const ALLOWED_CARD_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type CardMimeType = (typeof ALLOWED_CARD_MIME_TYPES)[number];

export function isAllowedCardMimeType(v: unknown): v is CardMimeType {
  return typeof v === "string" && (ALLOWED_CARD_MIME_TYPES as readonly string[]).includes(v);
}

// The client normalizes/resizes images before upload (longest edge ~1600-
// 2000px, re-encoded as JPEG), so a compressed card photo should land well
// under this. Kept generous enough for a caller that skips normalization
// (e.g. a direct API call), while staying under typical serverless
// request-body ceilings once base64 encoding adds its ~33% overhead.
export const MAX_CARD_IMAGE_BYTES = 4 * 1024 * 1024;

export function cardExtractionConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
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
text. Read small printed text carefully — business card text is often dense and low-resolution.
Cards may be oriented portrait or landscape; read the card in whichever orientation the text is
upright. Cards may contain both Arabic and English/Latin text — extract the English/Latin
version of each field where both are present, and Latin-script contact details (email, phone,
LinkedIn) exactly as printed, character for character. Respond with a single JSON object only,
no prose, no markdown code fences.`;

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
Preserve email and phone number exactly as printed — do not reformat, normalize, or correct them.
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

export type VisionCaller = (opts: {
  model: string;
  system: string;
  prompt: string;
  imageBase64: string;
  mediaType: CardMimeType;
  maxTokens?: number;
}) => Promise<VisionCallResult>;

export type CardExtractDiagnostic = VisionErrorKind | "RESPONSE_PARSE_ERROR";

export type CardExtractOutcome =
  | { ok: true; result: CardExtractResult }
  | { ok: false; diagnostic: CardExtractDiagnostic };

/**
 * `visionCall` defaults to the real Anthropic vision call; tests inject a
 * fake so the suite never makes a live paid call. The returned diagnostic
 * distinguishes provider-level failures (auth, model, request, no-text)
 * from a response that came back but couldn't be parsed as the expected
 * JSON shape — previously all of these collapsed into a single opaque
 * null, making a real production failure undiagnosable.
 */
export async function extractCardFields(
  imageBase64: string,
  mediaType: CardMimeType,
  visionCall: VisionCaller = completeVision
): Promise<CardExtractOutcome> {
  const callResult = await visionCall({
    model: TRIAGE_MODEL,
    system: SYSTEM,
    prompt: buildPrompt(),
    imageBase64,
    mediaType,
    maxTokens: 800,
  });

  if (!callResult.ok) {
    return { ok: false, diagnostic: callResult.kind };
  }

  const parsed = parseJsonBlock<CardExtractResult>(callResult.text);
  if (!parsed) {
    return { ok: false, diagnostic: "RESPONSE_PARSE_ERROR" };
  }
  return { ok: true, result: sanitize(parsed) };
}
