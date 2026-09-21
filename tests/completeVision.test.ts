import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { completeVision } from "../src/lib/proposals/llm";

/**
 * Exercises completeVision() itself against a mocked global fetch — this
 * is the one place that can genuinely reproduce every scenario in the
 * Sprint 06E.1 production-diagnosis Step 6 list (success, 400, provider
 * 401, 404, 413, 429, 500, a network fetch exception, and a malformed
 * response body) without ever making a real network call. process.env.ANTHROPIC_API_KEY
 * is set to a fake value only for the duration of these tests, so
 * NOT_CONFIGURED doesn't short-circuit every case — no real key is ever
 * used since fetch itself is replaced.
 */

const originalFetch = globalThis.fetch;
const originalKey = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "sk-ant-fake-test-key-not-real";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalKey;
});

function mockJsonResponse(status: number, body: unknown): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as typeof fetch;
}

const baseOpts = {
  model: "claude-haiku-4-5-20251001",
  system: "test system",
  prompt: "test prompt",
  imageBase64: "ZmFrZQ==",
  mediaType: "image/jpeg" as const,
};

describe("completeVision — mocked-fetch production scenarios", () => {
  test("success: 200 with a text content block", async () => {
    mockJsonResponse(200, { content: [{ type: "text", text: '{"fullName":"Jane Doe"}' }] });
    const result = await completeVision(baseOpts);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.text, '{"fullName":"Jane Doe"}');
  });

  test("route/API misconfiguration: no ANTHROPIC_API_KEY -> NOT_CONFIGURED, fetch never called", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      throw new Error("should not be called");
    }) as typeof fetch;
    const result = await completeVision(baseOpts);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.kind, "NOT_CONFIGURED");
    assert.equal(fetchCalled, false);
  });

  test("provider 401 -> PROVIDER_AUTH_ERROR", async () => {
    mockJsonResponse(401, { error: { type: "authentication_error", message: "invalid x-api-key" } });
    const result = await completeVision(baseOpts);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.kind, "PROVIDER_AUTH_ERROR");
    assert.equal(result.status, 401);
  });

  test("provider 404 (model not found) -> PROVIDER_MODEL_ERROR", async () => {
    mockJsonResponse(404, { error: { type: "not_found_error", message: "model not found" } });
    const result = await completeVision(baseOpts);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.kind, "PROVIDER_MODEL_ERROR");
  });

  test("provider 413 (payload too large) -> IMAGE_TOO_LARGE", async () => {
    globalThis.fetch = (async () => new Response("Payload Too Large", { status: 413 })) as typeof fetch;
    const result = await completeVision(baseOpts);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.kind, "IMAGE_TOO_LARGE");
  });

  test("provider 429 -> PROVIDER_RATE_LIMITED", async () => {
    mockJsonResponse(429, { error: { type: "rate_limit_error", message: "rate limited" } });
    const result = await completeVision(baseOpts);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.kind, "PROVIDER_RATE_LIMITED");
  });

  test("provider 500 -> PROVIDER_UNAVAILABLE, distinct from 'could not reach'", async () => {
    mockJsonResponse(500, { error: { type: "api_error", message: "internal server error" } });
    const result = await completeVision(baseOpts);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.kind, "PROVIDER_UNAVAILABLE");
  });

  test("network fetch exception (DNS/timeout/connection reset) -> PROVIDER_REQUEST_ERROR", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const result = await completeVision(baseOpts);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.kind, "PROVIDER_REQUEST_ERROR");
  });

  test("malformed/non-JSON success response body -> PROVIDER_REQUEST_ERROR, not an uncaught exception", async () => {
    globalThis.fetch = (async () => new Response("not json", { status: 200, headers: { "content-type": "text/plain" } })) as typeof fetch;
    const result = await completeVision(baseOpts);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.kind, "PROVIDER_REQUEST_ERROR");
  });

  test("200 response with no text content block -> NO_TEXT_EXTRACTED", async () => {
    mockJsonResponse(200, { content: [{ type: "tool_use", input: {} }] });
    const result = await completeVision(baseOpts);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.kind, "NO_TEXT_EXTRACTED");
  });

  test("never sends the API key or image bytes to console.error", async () => {
    const logs: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => { logs.push(args.map(String).join(" ")); };
    try {
      mockJsonResponse(401, { error: { type: "authentication_error", message: "invalid x-api-key" } });
      await completeVision({ ...baseOpts, imageBase64: "SENSITIVE_IMAGE_BYTES_MARKER" });
    } finally {
      console.error = originalError;
    }
    const joined = logs.join("\n");
    assert.ok(!joined.includes("sk-ant-fake-test-key-not-real"), "must never log the API key");
    assert.ok(!joined.includes("SENSITIVE_IMAGE_BYTES_MARKER"), "must never log image/base64 content");
  });
});
