import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { fundraisingRound, parseRoundKey, type RoundKey } from "./rules";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EVENT_ID_PATTERN = /^[a-zA-Z0-9_-]{12,80}$/;
const MAX_CLOCK_SKEW_SECONDS = 300;

/** Each public venture has an independent signing key. */
export function investorWebhookSecret(roundKey: RoundKey, env: Record<string, string | undefined>): string | undefined {
  const brand = env.CRM_INBOUND_INVESTOR_BRANDSPRK_SECRET;
  const place = env.CRM_INBOUND_INVESTOR_PLACEPULSE_SECRET;
  // Fail closed if deployment accidentally reuses one signing key for both sites.
  if (brand && place && brand === place) return undefined;
  const selected = roundKey === "brandsprk-preseed-2026" ? brand : place;
  return selected && selected.length >= 32 ? selected : undefined;
}

export type InvestorInquiry = {
  eventId: string;
  roundKey: RoundKey;
  fullName: string;
  organization: string;
  email: string;
  message: string;
  sourcePage: string;
  consent: true;
  consentVersion: string;
};

function bounded(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error(`Invalid ${label}.`);
  }
  return value.trim();
}

/** Parse only an explicit opt-in request. No transcript, browser telemetry or tracking IP is accepted. */
export function parseInvestorInquiry(value: unknown): InvestorInquiry {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid inquiry.");
  const body = value as Record<string, unknown>;
  if (body.consent !== true) throw new Error("Investor contact consent is required.");
  const eventId = bounded(body.eventId, "event ID", 80);
  if (!EVENT_ID_PATTERN.test(eventId)) throw new Error("Invalid event ID.");
  const roundKey = parseRoundKey(body.roundKey);
  const email = bounded(body.email, "email", 254).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw new Error("Invalid email.");
  const sourcePage = bounded(body.sourcePage, "source page", 250);
  if (sourcePage !== fundraisingRound(roundKey).briefingUrl) {
    throw new Error("Investor inquiry source does not match venture.");
  }
  const consentVersion = bounded(body.consentVersion, "consent version", 40);
  return {
    eventId,
    roundKey,
    fullName: bounded(body.fullName, "full name", 160),
    organization: bounded(body.organization, "organization", 160),
    email,
    message: bounded(body.message, "message", 1500),
    sourcePage,
    consent: true,
    consentVersion,
  };
}

/** Server-to-server authorization. Browser clients must never see the secret. */
export function verifyInvestorWebhook(input: {
  secret: string | undefined;
  timestamp: string | null;
  signature: string | null;
  rawBody: string | Buffer;
  nowSeconds?: number;
}): boolean {
  const { secret, timestamp, signature, rawBody, nowSeconds = Math.floor(Date.now() / 1000) } = input;
  if (!secret || secret.length < 32 || !timestamp || !/^\d{10}$/.test(timestamp) || !signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(nowSeconds - seconds) > MAX_CLOCK_SKEW_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** Deterministic import key; stable across retries; never exposes email or message. */
export function inquirySourceKey(inquiry: InvestorInquiry): string {
  return "inbound-" + createHash("sha256").update(`${inquiry.roundKey}:${inquiry.eventId}`).digest("hex").slice(0, 32);
}
