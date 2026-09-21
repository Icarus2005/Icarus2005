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
 * further in this production-diagnosis follow-up).
 *
 * Structured JSON only, never a CRM write, never an automatic save. Auth
 * is the same shared-password gate as every other route
 * (src/middleware.ts). The image is processed in memory only — never
 * written to disk, never logged, never persisted.
 *
 * Every stage logs one safe line, tagged with the client-generated
 * traceId when the client sent one, so a single production attempt can be
 * traced end to end: request reached the route, MIME/size, parse success,
 * provider call started, provider status, result category, response
 * returned. Never logs the API key, image bytes/base64, or raw card
 * contents. The client gets both a clean human-facing message and the
 * safe diagnostic category — never the raw provider error.
 */

const DIAGNOSTIC_RESPONSES: Record<CardExtractDiagnostic, { status: number; message: string }> = {
  NOT_CONFIGURED: { status: 503, message: "Card extraction is not configured. Set ANTHROPIC_API_KEY to enable it." },
  PROVIDER_AUTH_ERROR: { status: 502, message: "Card extraction is temporarily unavailable. Enter details manually for now." },
  PROVIDER_MODEL_ERROR: { status: 502, message: "Card extraction is temporarily unavailable. Enter details manually for now." },
  IMAGE_TOO_LARGE: { status: 400, message: "This image is too large for extraction. Try a smaller or more compressed photo." },
  UNSUPPORTED_IMAGE: { status: 400, message: "This image format isn't supported for extraction. Try a JPEG or PNG photo." },
  PROVIDER_RATE_LIMITED: { status: 502, message: "The extraction service is busy right now. Try again in a moment." },
  PROVIDER_UNAVAILABLE: { status: 502, message: "The extraction service is temporarily unavailable. Try again shortly." },
  PROVIDER_REQUEST_ERROR: { status: 502, message: "Could not reach the extraction service. Try again." },
  NO_TEXT_EXTRACTED: { status: 502, message: "Could not read this card. Try a clearer, well-lit photo, or enter details manually." },
  RESPONSE_PARSE_ERROR: { status: 502, message: "Could not extract details from this image. Try a clearer photo, or enter details manually." },
};

function log(traceId: string, event: string) {
  console.error(`[card-extract:${traceId}] ${event}`);
}

function fail(traceId: string, category: CardExtractDiagnostic | "BAD_REQUEST", message: string, status: number) {
  log(traceId, `response returned category=${category} status=${status}`);
  return NextResponse.json({ category, message, traceId }, { status });
}

export async function POST(req: NextRequest) {
  let form: FormData;
  let traceId = "";
  try {
    form = await req.formData();
    const clientTraceId = form.get("traceId");
    traceId = typeof clientTraceId === "string" && clientTraceId ? clientTraceId : crypto.randomUUID();
    log(traceId, "request reached route");
  } catch (err) {
    traceId = crypto.randomUUID();
    log(traceId, `request reached route but form parsing failed: ${err instanceof Error ? err.name : "unknown"}`);
    return fail(traceId, "BAD_REQUEST", "Expected multipart/form-data with one image file.", 400);
  }

  try {
    const file = form.get("image");
    if (!(file instanceof File)) {
      return fail(traceId, "BAD_REQUEST", "An image file is required.", 400);
    }

    log(traceId, `route parse success mime=${file.type || "unknown"} bytes=${file.size}`);

    if (!isAllowedCardMimeType(file.type)) {
      return fail(traceId, "UNSUPPORTED_IMAGE", DIAGNOSTIC_RESPONSES.UNSUPPORTED_IMAGE.message, 400);
    }
    if (file.size > MAX_CARD_IMAGE_BYTES) {
      return fail(traceId, "IMAGE_TOO_LARGE", DIAGNOSTIC_RESPONSES.IMAGE_TOO_LARGE.message, 400);
    }
    if (file.size === 0) {
      return fail(traceId, "BAD_REQUEST", "The uploaded image is empty.", 400);
    }

    const configured = cardExtractionConfigured();
    log(traceId, `provider configured=${configured}`);
    if (!configured) {
      return fail(traceId, "NOT_CONFIGURED", DIAGNOSTIC_RESPONSES.NOT_CONFIGURED.message, 503);
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    // Double-check against the real byte length, not just the declared size.
    if (bytes.byteLength > MAX_CARD_IMAGE_BYTES) {
      return fail(traceId, "IMAGE_TOO_LARGE", DIAGNOSTIC_RESPONSES.IMAGE_TOO_LARGE.message, 400);
    }

    log(traceId, `provider call started model=${TRIAGE_MODEL}`);
    const outcome = await extractCardFields(bytes.toString("base64"), file.type as "image/jpeg" | "image/png" | "image/webp", undefined, traceId);

    if (!outcome.ok) {
      log(traceId, `provider result category=${outcome.diagnostic}`);
      const { status, message } = DIAGNOSTIC_RESPONSES[outcome.diagnostic];
      return fail(traceId, outcome.diagnostic, message, status);
    }

    log(traceId, "provider result category=SUCCESS");
    log(traceId, "response returned category=SUCCESS status=200");
    return NextResponse.json({ ...outcome.result, traceId });
  } catch (err) {
    // Backstop: an unexpected exception anywhere in this handler must
    // still return safe JSON, never leak an unhandled-error HTML page or
    // any exception detail (which could include request internals).
    log(traceId, `unhandled exception: ${err instanceof Error ? err.name : "unknown"}`);
    return fail(traceId, "PROVIDER_REQUEST_ERROR", DIAGNOSTIC_RESPONSES.PROVIDER_REQUEST_ERROR.message, 502);
  }
}
