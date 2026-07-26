import { prisma } from "@/lib/prisma";
import { BUSINESS_LINES, PRODUCTS_META, isProductKey } from "@/lib/products";
import { TRIAGE_MODEL, complete, parseJsonBlock } from "./llm";

/**
 * Phase 2 — Intelligence & Triage.
 *
 * Runs a cheap pass over a meeting transcript to decide whether it warrants a
 * proposal at all, and which ArqOne business line it belongs to. This gate is
 * what keeps expensive generation off the ~80% of calls that are check-ins,
 * internal syncs or support conversations.
 */

export type TriageResult = {
  qualified: boolean;
  score: number; // 0–100
  reason: string;
  product: string; // canonical key
  clientName: string | null;
  engine: "ANTHROPIC" | "HEURISTIC";
};

// Signals that a call is a genuine sales conversation.
const BUYING_SIGNALS = [
  "proposal", "quote", "quotation", "pricing", "price", "budget", "cost",
  "scope", "statement of work", "sow", "contract", "timeline", "deliverable",
  "next steps", "rollout", "pilot", "engagement", "retainer", "invoice",
];

const DISQUALIFYING_SIGNALS = [
  "standup", "stand-up", "retro", "retrospective", "all hands", "all-hands",
  "1:1", "one-on-one", "internal sync", "team sync", "interview", "onboarding call",
];

// Keywords mapping a transcript onto an ArqOne business line.
const PRODUCT_KEYWORDS: Record<string, string[]> = {
  PLACEPULSE: [
    "placepulse", "footfall", "location intelligence", "catchment", "visitor",
    "mall", "retail location", "geospatial", "site selection", "mobility data",
    "out of home", "ooh",
  ],
  PLYMIO: [
    "plymio", "coaching", "coach", "mentor", "mentoring", "marketplace",
    "executive coaching", "learning", "development programme",
  ],
  AI_NAVIGATOR: [
    "ai navigator", "navigator", "ai fluency", "ai literacy", "enablement",
    "executive programme", "adoption roadmap", "use case prioritisation",
    "upskilling", "training programme",
  ],
  ADVISORY: [
    "advisory", "audit", "efficiency", "operating model", "governance",
    "diagnostic", "workshop", "assessment", "blueprint", "consulting",
  ],
};

function countMatches(haystack: string, needles: string[]): number {
  return needles.reduce((n, needle) => (haystack.includes(needle) ? n + 1 : n), 0);
}

/** Deterministic fallback used when no ANTHROPIC_API_KEY is configured. */
export function heuristicTriage(title: string, transcript: string): TriageResult {
  const text = `${title}\n${transcript}`.toLowerCase();

  const disqualifiers = countMatches(text, DISQUALIFYING_SIGNALS);
  const buying = countMatches(text, BUYING_SIGNALS);

  // Product with the most keyword hits wins; ties fall back to UNASSIGNED.
  let product = "UNASSIGNED";
  let best = 0;
  for (const key of BUSINESS_LINES) {
    const hits = countMatches(text, PRODUCT_KEYWORDS[key] ?? []);
    if (hits > best) {
      best = hits;
      product = key;
    }
  }

  // Score: buying signals drive it up, internal-meeting markers drive it down.
  const score = Math.max(
    0,
    Math.min(100, buying * 12 + (best > 0 ? 20 : 0) - disqualifiers * 25)
  );
  const qualified = score >= 40 && disqualifiers === 0;

  const reason = qualified
    ? `${buying} buying signal(s) detected${
        best > 0 ? ` with ${PRODUCTS_META[product as keyof typeof PRODUCTS_META].label} keywords` : ""
      }.`
    : disqualifiers > 0
      ? "Reads as an internal or non-sales meeting."
      : `Only ${buying} buying signal(s) — below the proposal threshold.`;

  return {
    qualified,
    score,
    reason,
    product,
    clientName: null,
    engine: "HEURISTIC",
  };
}

const TRIAGE_SYSTEM = `You triage sales-call transcripts for ArqOne Labs, which sells four business lines:
- PLACEPULSE: location and decision intelligence (footfall, catchment, site selection)
- PLYMIO: AI coaching marketplace and executive development
- AI_NAVIGATOR: executive AI fluency and enterprise adoption programmes
- ADVISORY: AI efficiency audits, operating models, governance

Decide whether the call warrants writing a client proposal. Internal meetings,
standups, interviews, support calls and casual check-ins do NOT.

Respond with ONLY a JSON object:
{"qualified": boolean, "score": 0-100, "reason": "one sentence", "product": "PLACEPULSE|PLYMIO|AI_NAVIGATOR|ADVISORY|UNASSIGNED", "clientName": "company name or null"}`;

/** Runs triage, preferring the model and falling back to the heuristic. */
export async function triageTranscript(
  title: string,
  transcript: string
): Promise<TriageResult> {
  const truncated = transcript.slice(0, 12_000);
  const raw = await complete({
    model: TRIAGE_MODEL,
    system: TRIAGE_SYSTEM,
    prompt: `Meeting title: ${title}\n\nTranscript:\n${truncated}`,
    maxTokens: 500,
  });

  const parsed = parseJsonBlock<{
    qualified: boolean;
    score: number;
    reason: string;
    product: string;
    clientName: string | null;
  }>(raw);

  if (!parsed) return heuristicTriage(title, transcript);

  return {
    qualified: Boolean(parsed.qualified),
    score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
    reason: String(parsed.reason ?? "").slice(0, 500) || "No reason given.",
    product: isProductKey(parsed.product) ? parsed.product : "UNASSIGNED",
    clientName: parsed.clientName ? String(parsed.clientName).slice(0, 200) : null,
    engine: "ANTHROPIC",
  };
}

/**
 * Triages a stored transcript and persists the outcome, attempting to link it
 * to an existing CRM account by name.
 */
export async function runTriage(transcriptId: string) {
  const t = await prisma.meetingTranscript.findUnique({ where: { id: transcriptId } });
  if (!t) throw new Error("Transcript not found");

  let result: TriageResult;
  try {
    result = await triageTranscript(t.title, t.rawTranscript);
  } catch {
    await prisma.meetingTranscript.update({
      where: { id: t.id },
      data: { triageStatus: "FAILED", triageReason: "Triage errored", triagedAt: new Date() },
    });
    throw new Error("Triage failed");
  }

  // Best-effort link to a known account by name mentioned in the call.
  let accountId = t.accountId;
  if (!accountId && result.clientName) {
    const account = await prisma.account.findFirst({
      where: { name: { contains: result.clientName, mode: "insensitive" } },
      select: { id: true },
    });
    accountId = account?.id ?? null;
  }

  return prisma.meetingTranscript.update({
    where: { id: t.id },
    data: {
      triageStatus: result.qualified ? "QUALIFIED" : "SKIPPED",
      triageScore: result.score,
      triageReason: result.reason,
      detectedProduct: result.product,
      triagedAt: new Date(),
      accountId,
    },
  });
}
