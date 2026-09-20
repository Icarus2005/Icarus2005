import { NextRequest, NextResponse } from "next/server";
import {
  isAllowedCardMimeType,
  MAX_CARD_IMAGE_BYTES,
  cardExtractionConfigured,
  extractCardFields,
} from "@/lib/capture/cardExtract";

/**
 * Business card extraction — Sprint 06E.1, Phase 3.
 *
 * Structured JSON only, never a CRM write, never an automatic save. Auth
 * is the same shared-password gate as every other route
 * (src/middleware.ts). The image is processed in memory only — never
 * written to disk, never logged, never persisted.
 */
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
    return NextResponse.json({ error: "Unsupported image type. Use JPEG, PNG, or WebP." }, { status: 400 });
  }
  if (file.size > MAX_CARD_IMAGE_BYTES) {
    return NextResponse.json({ error: `Image is too large (max ${Math.floor(MAX_CARD_IMAGE_BYTES / 1024 / 1024)}MB).` }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "The uploaded image is empty." }, { status: 400 });
  }

  if (!cardExtractionConfigured()) {
    return NextResponse.json({ error: "Card extraction is not configured. Set ANTHROPIC_API_KEY to enable it." }, { status: 503 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  // Double-check against the real byte length, not just the declared size.
  if (bytes.byteLength > MAX_CARD_IMAGE_BYTES) {
    return NextResponse.json({ error: `Image is too large (max ${Math.floor(MAX_CARD_IMAGE_BYTES / 1024 / 1024)}MB).` }, { status: 400 });
  }

  const result = await extractCardFields(bytes.toString("base64"), file.type as "image/jpeg" | "image/png" | "image/webp");
  if (!result) {
    return NextResponse.json({ error: "Could not extract details from this image. Try a clearer photo, or enter details manually." }, { status: 502 });
  }

  return NextResponse.json(result);
}
