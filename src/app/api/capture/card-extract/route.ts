import { NextRequest, NextResponse } from "next/server";
import {
  isAllowedCardMimeType,
  MAX_CARD_IMAGE_BYTES,
  cardExtractionConfigured,
  extractCardFields,
  type CardExtractDiagnostic,
} from "@/lib/capture/cardExtract";
import { TRIAGE_MODEL } from "@/lib/proposals/llm";

/**
 * Business card extraction — Sprint 06E.1, Phase 3 (diagnostics hardened
 * in the production-diagnosis follow-up).
 *
 * Structured JSON only, never a CRM write, never an automatic save. Auth
 * is the same shared-password gate as every other route
 * (src/middleware.ts). The image is processed in memory only — never
 * written to disk, never logged, never persisted.
 *
 * Every failure path logs a safe diagnostic line (diagnostic category +
 * MIME + byte size + model id) so a real production failure is
 * distinguishable from another without ever logging the API key, the
 * image bytes/base64, or any other secret. The client gets a clean
 * human-facing message plus the safe diagnostic category, never the raw
 * provider error.
 */

const DIAGNOSTIC_RESPONSES: Record<CardExtractDiagnostic, { status: number; message: string }> = {
  NOT_CONFIGURED: { status: 503, message: "Card extraction is not configured. Set ANTHROPIC_API_KEY to enable it." },
  PROVIDER_AUTH_ERROR: { status: 502, message: "Card extraction is temporarily unavailable. Enter details manually for now." },
  PROVIDER_MODEL_ERROR: { status: 502, message: "Card extraction is temporarily unavailable. Enter details manually for now." },
  IMAGE_TOO_LARGE: { status: 400, message: "This image is too large for extraction. Try a smaller or more compressed photo." },
  UNSUPPORTED_IMAGE: { status: 400, message: "This image format isn't supported for extraction. Try a JPEG or PNG photo." },
  PROVIDER_REQUEST_ERROR: { status: 502, message: "Could not reach the extraction service. Try again." },
  NO_TEXT_EXTRACTED: { status: 502, message: "Could not read this card. Try a clearer, well-lit photo, or enter details manually." },
  RESPONSE_PARSE_ERROR: { status: 502, message: "Could not extract details from this image. Try a clearer photo, or enter details manually." },
};

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data with one image file." }, { status: 400 });
  }

  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "An image file is required." }, { status: 400 });
  }
  if (!isAllowedCardMimeType(file.type)) {
    console.error(`card-extract rejected: reason=client_mime mime=${file.type || "unknown"} bytes=${file.size}`);
    return NextResponse.json({ error: "Unsupported image type. Use JPEG, PNG, or WebP.", diagnostic: "UNSUPPORTED_IMAGE" }, { status: 400 });
  }
  if (file.size > MAX_CARD_IMAGE_BYTES) {
    console.error(`card-extract rejected: reason=client_size mime=${file.type} bytes=${file.size}`);
    return NextResponse.json({ error: `Image is too large (max ${Math.floor(MAX_CARD_IMAGE_BYTES / 1024 / 1024)}MB).`, diagnostic: "IMAGE_TOO_LARGE" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "The uploaded image is empty." }, { status: 400 });
  }

  if (!cardExtractionConfigured()) {
    console.error("card-extract rejected: reason=not_configured");
    return NextResponse.json({ error: DIAGNOSTIC_RESPONSES.NOT_CONFIGURED.message, diagnostic: "NOT_CONFIGURED" }, { status: 503 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  // Double-check against the real byte length, not just the declared size.
  if (bytes.byteLength > MAX_CARD_IMAGE_BYTES) {
    console.error(`card-extract rejected: reason=real_size mime=${file.type} bytes=${bytes.byteLength}`);
    return NextResponse.json({ error: `Image is too large (max ${Math.floor(MAX_CARD_IMAGE_BYTES / 1024 / 1024)}MB).`, diagnostic: "IMAGE_TOO_LARGE" }, { status: 400 });
  }

  const outcome = await extractCardFields(bytes.toString("base64"), file.type as "image/jpeg" | "image/png" | "image/webp");
  if (!outcome.ok) {
    // Safe: diagnostic category, MIME, byte size, model id — never the
    // image bytes/base64, never the API key, never raw provider payloads
    // (completeVision already logged the provider-level status/type).
    console.error(`card-extract failed: diagnostic=${outcome.diagnostic} mime=${file.type} bytes=${bytes.byteLength} model=${TRIAGE_MODEL}`);
    const { status, message } = DIAGNOSTIC_RESPONSES[outcome.diagnostic];
    return NextResponse.json({ error: message, diagnostic: outcome.diagnostic }, { status });
  }

  return NextResponse.json(outcome.result);
}
