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
