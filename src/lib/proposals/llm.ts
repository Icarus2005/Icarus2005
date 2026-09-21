/**
 * Thin Anthropic client used by the proposal pipeline.
 *
 * The whole pipeline works without an API key: every generation step has a
 * deterministic template fallback, so the feature is demoable and testable
 * offline. Set ANTHROPIC_API_KEY to switch to real generation.
 *
 * Mirrors the reference architecture's cost split: a cheap model for triage
 * (high volume, throwaway decisions) and a stronger model for the proposal
 * content itself.
 */

const API_URL = "https://api.anthropic.com/v1/messages";

export const TRIAGE_MODEL = "claude-haiku-4-5-20251001";
export const WRITER_MODEL = "claude-sonnet-5";

export function llmConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type LlmResult = { text: string; engine: "ANTHROPIC" | "TEMPLATE" };

/**
 * Calls Anthropic and returns the text response. Returns null when no key is
 * configured or the call fails — callers fall back to templates rather than
 * failing the pipeline, so a missing key never blocks a proposal.
 */
export async function complete(opts: {
  model: string;
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens ?? 2000,
        system: opts.system,
        messages: [{ role: "user", content: opts.prompt }],
      }),
      // Keep a bound so a hanging provider can't wedge a pipeline run.
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      console.error(`Anthropic request failed: ${res.status} ${await res.text()}`);
      return null;
    }
    const data = await res.json();
    const text = (data.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("")
      .trim();
    return text || null;
  } catch (err) {
    console.error("Anthropic request errored:", err);
    return null;
  }
}

/**
 * Vision variant of complete() — same client, extended with a single image
 * content block. Added for Sprint 06E.1 business-card extraction; does not
 * change complete()'s behavior or return shape for any existing caller
 * (nothing else calls completeVision).
 *
 * Unlike complete(), this returns a diagnosable result instead of a bare
 * null — production card-extraction failures were previously indistinguishable
 * (auth error vs. model error vs. a genuinely unreadable photo all looked
 * identical to the caller and to the user). Never logs the API key, the
 * request body, or the image/base64 — only the HTTP status, the provider's
 * error `type`, and a truncated error message.
 */
export type VisionErrorKind =
  | "NOT_CONFIGURED"
  | "PROVIDER_AUTH_ERROR"
  | "PROVIDER_MODEL_ERROR"
  | "IMAGE_TOO_LARGE"
  | "UNSUPPORTED_IMAGE"
  | "PROVIDER_REQUEST_ERROR"
  | "NO_TEXT_EXTRACTED";

export type VisionCallResult =
  | { ok: true; text: string }
  | { ok: false; kind: VisionErrorKind; status?: number };

function classifyVisionError(status: number, errorType: string, errorMessage: string): VisionErrorKind {
  if (status === 401 || status === 403) return "PROVIDER_AUTH_ERROR";
  if (status === 404) return "PROVIDER_MODEL_ERROR";
  const msg = errorMessage.toLowerCase();
  if (status === 400) {
    if (errorType === "not_found_error" || msg.includes("model:")) return "PROVIDER_MODEL_ERROR";
    if (msg.includes("too large") || msg.includes("exceeds") || msg.includes("maximum allowed size")) return "IMAGE_TOO_LARGE";
    if (msg.includes("media_type") || msg.includes("image format") || msg.includes("unsupported image")) return "UNSUPPORTED_IMAGE";
  }
  return "PROVIDER_REQUEST_ERROR";
}

export async function completeVision(opts: {
  model: string;
  system: string;
  prompt: string;
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  maxTokens?: number;
}): Promise<VisionCallResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, kind: "NOT_CONFIGURED" };

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens ?? 1000,
        system: opts.system,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: opts.mediaType, data: opts.imageBase64 } },
              { type: "text", text: opts.prompt },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      let errorType = "";
      let errorMessage = "";
      try {
        const errBody = await res.json();
        errorType = typeof errBody?.error?.type === "string" ? errBody.error.type : "";
        errorMessage = typeof errBody?.error?.message === "string" ? errBody.error.message.slice(0, 300) : "";
      } catch {
        // Error body wasn't JSON — proceed with just the status.
      }
      const kind = classifyVisionError(res.status, errorType, errorMessage);
      // Safe to log: HTTP status + provider error type/message (truncated),
      // model id, and the classification. Never the request body or image.
      console.error(`Anthropic vision request failed: status=${res.status} type=${errorType || "unknown"} kind=${kind} model=${opts.model}`);
      return { ok: false, kind, status: res.status };
    }
    const data = await res.json();
    const text = (data.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("")
      .trim();
    if (!text) {
      console.error(`Anthropic vision request returned no text content: model=${opts.model}`);
      return { ok: false, kind: "NO_TEXT_EXTRACTED" };
    }
    return { ok: true, text };
  } catch (err) {
    console.error("Anthropic vision request errored:", err instanceof Error ? err.message : "unknown error");
    return { ok: false, kind: "PROVIDER_REQUEST_ERROR" };
  }
}

/** Extracts the first JSON object from a model response. */
export function parseJsonBlock<T>(text: string | null): T | null {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}
