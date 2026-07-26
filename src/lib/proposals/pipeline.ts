import { prisma } from "@/lib/prisma";
import { productLabel } from "@/lib/products";
import { fmtMoney } from "@/lib/format";
import { WRITER_MODEL, complete } from "./llm";
import { nextStage, type ProposalStage } from "./stages";

/**
 * Phase 3 — the proposal pipeline itself.
 *
 * A coordinator advances a proposal one stage at a time; each stage is a
 * single-purpose "skill" that writes one artifact. Every stage has a template
 * fallback so the pipeline completes without an API key (marked TEMPLATE in
 * the provenance field), and every run is recorded in ProposalEvent.
 */

type ProposalRecord = NonNullable<Awaited<ReturnType<typeof loadProposal>>>;

function loadProposal(id: string) {
  return prisma.proposal.findUnique({
    where: { id },
    include: {
      transcript: true,
      account: {
        include: {
          opportunities: {
            select: { id: true, name: true, product: true, value: true, stage: true, closedAt: true },
          },
          contacts: { select: { firstName: true, lastName: true, title: true } },
        },
      },
    },
  });
}

async function record(proposalId: string, stage: string, status: string, detail?: string) {
  await prisma.proposalEvent.create({
    data: { proposalId, stage, status, detail: detail?.slice(0, 1000) },
  });
}

// ─── Skill: Transcript Analyzer ─────────────────────────────────────────────

const ANALYZER_SYSTEM = `You are a sales analyst for ArqOne Labs. Read a discovery-call transcript
and extract what a proposal writer needs. Be concrete and specific — quote the client's own
language for pain points. Output markdown with these sections:

## Client Situation
## Stated Requirements
## Pain Points
## Success Criteria
## Constraints & Timeline
## Pricing Discussed
Quote VERBATIM any figures, rates, ranges, discounts or budget statements either side
mentioned — including who said them. If money was discussed but no figure was given, say so.
If nothing was said about money at all, write exactly: NONE DISCUSSED.
## Open Questions`;

/**
 * Deterministic sweep for money mentioned in a transcript. Used by the template
 * path so that pricing said aloud is still captured without a language model —
 * the pricing guardrail must not depend on an API key being present.
 */
function sweepPricingLines(transcript: string): string | null {
  const MONEY =
    /(\$|usd|aed|sar|qar|eur|£)\s?[\d,.]+\s?(k|m|thousand|million)?|\b\d[\d,.]*\s?(usd|aed|sar|qar|dollars?|dirhams?|riyals?)\b/i;
  const hits = transcript
    .split(/\n|(?<=[.!?])\s+/)
    .map((l) => l.trim())
    .filter((l) => l && MONEY.test(l))
    .slice(0, 12);
  if (hits.length === 0) return null;
  return `_Detected automatically from the transcript — verify against the call before issuing._\n${hits
    .map((l) => `- ${l}`)
    .join("\n")}`;
}

/** Pulls the "Pricing Discussed" section out of the analyzer's markdown. */
function extractQuotedPricing(requirements: string): string | null {
  const match = requirements.match(/##\s*Pricing Discussed\s*\n([\s\S]*?)(?:\n##\s|\s*$)/i);
  if (!match) return null;
  const body = match[1].trim();
  if (!body || /^none discussed\.?$/i.test(body)) return null;
  return body.slice(0, 2000);
}

async function runAnalyzer(p: ProposalRecord) {
  const transcript = p.transcript?.rawTranscript ?? "";
  if (transcript) {
    const out = await complete({
      model: WRITER_MODEL,
      system: ANALYZER_SYSTEM,
      prompt: `Business line: ${productLabel(p.product)}\nMeeting: ${p.transcript?.title}\n\nTranscript:\n${transcript.slice(0, 30_000)}`,
      maxTokens: 2000,
    });
    if (out) return { content: out, engine: "ANTHROPIC" as const };
  }

  // Template fallback: structure what we know without inventing detail.
  const lines = transcript
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const excerpt = lines.slice(0, 12).map((l) => `- ${l}`).join("\n") || "- No transcript captured.";
  return {
    content: `## Client Situation
${p.clientName ?? p.account?.name ?? "Client"} discussed ${productLabel(p.product)} on ${
      p.transcript?.meetingDate.toISOString().split("T")[0] ?? "an unrecorded date"
    }.

## Stated Requirements
_Extracted automatically without a language model — review before sending._

## Transcript Excerpt
${excerpt}

## Open Questions
- Confirm budget range and decision timeline
- Confirm technical and data prerequisites`,
    engine: "TEMPLATE" as const,
  };
}

// ─── Skill: Client Research ─────────────────────────────────────────────────

async function runResearch(p: ProposalRecord) {
  // Research is grounded in CRM data rather than invented facts.
  const account = p.account;
  const openOpps = (account?.opportunities ?? []).filter((o) => !o.closedAt);
  const crmContext = account
    ? `Account: ${account.name}
Industry: ${account.industry ?? "unknown"}
Market: ${account.country}
Sector: ${account.sector}
Tier: ${account.tier ?? "unclassified"}
Open opportunities: ${openOpps.length ? openOpps.map((o) => `${o.name} (${productLabel(o.product)}, ${o.value ? fmtMoney(o.value) : "unvalued"})`).join("; ") : "none"}
Known contacts: ${account.contacts.map((c) => `${c.firstName} ${c.lastName}${c.title ? ` — ${c.title}` : ""}`).join("; ") || "none"}`
    : `No CRM account linked yet for ${p.clientName ?? "this client"}.`;

  const out = await complete({
    model: WRITER_MODEL,
    system: `You prepare account context for an ArqOne Labs proposal. Use ONLY the CRM facts
supplied — do not invent clients, revenue figures, or news. Where information is missing, say so
explicitly and suggest what to verify. Output markdown with:

## Account Snapshot
## Existing Relationship
## Positioning Angle
## Information Gaps`,
    prompt: `Business line: ${productLabel(p.product)}\n\nCRM data:\n${crmContext}\n\nRequirements from the call:\n${p.requirements ?? "(none captured)"}`,
    maxTokens: 1500,
  });
  if (out) return { content: out, engine: "ANTHROPIC" as const };

  return {
    content: `## Account Snapshot
${crmContext}

## Information Gaps
_Generated without a language model — verify positioning manually before sending._`,
    engine: "TEMPLATE" as const,
  };
}

// ─── Skill: Proposal Writer ─────────────────────────────────────────────────

const WRITER_SYSTEM = `You write client proposals for ArqOne Labs.

CRITICAL SCOPING RULE: the service catalogue below lists everything ArqOne can deliver, but no
client ever buys all of it. Include ONLY the components that were actually discussed on the call,
as evidenced by the call analysis. Silently omit everything else — never pad the proposal with
services the prospect did not ask about.

CRITICAL PRICING RULE — precedence order:
1. If PRICING QUOTED ON THE CALL is present, use exactly those figures. A number said aloud to
   the client is a commitment; the catalogue's standard rates do NOT override it.
2. If the quoted figures conflict with the catalogue, follow the quoted figures and add a bolded
   note under Commercials: **Note: reflects pricing discussed on the call, which differs from
   standard rates — confirm before issuing.**
3. If no pricing was discussed, use the catalogue's standard rates.
4. If neither exists, write [PRICING TO CONFIRM]. Never invent a number.

Ground every claim in the supplied analysis, research and catalogue — never invent case studies,
client names, metrics or credentials. Where a number is unknown (pricing, timeline), insert a
clearly marked placeholder like [PRICING TO CONFIRM] rather than guessing. Follow the supplied
document template and brand guidance. Write in British English, confident but not hyperbolic.`;

/** Loads the active "binder" — catalogue, template, brand — for a product. */
async function loadKnowledge(product: string) {
  const entries = await prisma.proposalKnowledge.findMany({
    where: { active: true, OR: [{ product }, { product: null }] },
    orderBy: { kind: "asc" },
  });
  const section = (kind: string) =>
    entries
      .filter((e) => e.kind === kind)
      .map((e) => `### ${e.title}\n${e.content}`)
      .join("\n\n");
  return {
    catalog: section("SERVICE_CATALOG"),
    template: section("TEMPLATE"),
    brand: section("BRAND"),
    examples: section("WINNING_EXAMPLE"),
    count: entries.length,
  };
}

async function runWriter(p: ProposalRecord) {
  const kb = await loadKnowledge(p.product);

  const out = await complete({
    model: WRITER_MODEL,
    system: WRITER_SYSTEM,
    prompt: `Business line: ${productLabel(p.product)}
Client: ${p.clientName ?? p.account?.name ?? "the client"}
Indicative value: ${p.estimatedValue ? fmtMoney(p.estimatedValue) : "not yet established"}

## SERVICE CATALOGUE (include only what was discussed; standard rates)
${kb.catalog || "(no catalogue configured)"}

## PRICING QUOTED ON THE CALL${p.quotedPricing ? " — TAKES PRECEDENCE" : ""}
${p.quotedPricing ?? "(nothing quoted — fall back to catalogue rates)"}

## DOCUMENT TEMPLATE
${kb.template || "Use: Executive Summary, Understanding Your Requirements, Proposed Approach, Scope of Work, Timeline, Commercials, Next Steps."}

## BRAND GUIDANCE
${kb.brand || "(none configured)"}

${kb.examples ? `## REFERENCE — PAST WINNING PROPOSALS\n${kb.examples}\n` : ""}
## CALL ANALYSIS
${p.requirements ?? "(none)"}

## ACCOUNT RESEARCH
${p.research ?? "(none)"}`,
    maxTokens: 4000,
  });
  if (out) return { content: out, engine: "ANTHROPIC" as const };

  const client = p.clientName ?? p.account?.name ?? "the client";
  return {
    content: `# ${productLabel(p.product)} Proposal — ${client}

## Executive Summary
[DRAFT — generated without a language model. Complete before sending.]

ArqOne Labs proposes a ${productLabel(p.product)} engagement for ${client}, based on the
discovery call held on ${p.transcript?.meetingDate.toISOString().split("T")[0] ?? "[DATE]"}.

## Understanding Your Requirements
${p.requirements ?? "[Add requirements from the call analysis.]"}

## Proposed Approach
[APPROACH TO COMPLETE]

## Scope of Work
[SCOPE TO COMPLETE]

## Timeline
[TIMELINE TO CONFIRM]

## Commercials
${p.estimatedValue ? `Indicative value: ${fmtMoney(p.estimatedValue)}` : "[PRICING TO CONFIRM]"}

## Next Steps
1. Review and confirm scope
2. Agree commercials and timeline
3. Countersign and schedule kick-off`,
    engine: "TEMPLATE" as const,
  };
}

// ─── Skill: Proposal Formatter ──────────────────────────────────────────────

async function runFormatter(p: ProposalRecord) {
  const draft = p.draftContent ?? "";
  const client = p.clientName ?? p.account?.name ?? "Client";
  const header = `---
**ArqOne Labs** · ${productLabel(p.product)}
Prepared for: ${client}
Date: ${new Date().toISOString().split("T")[0]}
Status: Draft for internal review
---

`;
  const footer = `

---
_Prepared by ArqOne Labs. This document is confidential and intended solely for ${client}._`;

  // Formatting is deterministic presentation work — no model call needed.
  return { content: `${header}${draft}${footer}`, engine: (p.generatedBy as "ANTHROPIC" | "TEMPLATE") ?? "TEMPLATE" };
}

// ─── Coordinator ────────────────────────────────────────────────────────────

/**
 * Advances a proposal by exactly one stage. Returns the updated record.
 * Failures are recorded on the proposal rather than thrown away, so a stuck
 * proposal is visible in the UI instead of silently disappearing.
 */
export async function advanceProposal(proposalId: string) {
  const p = await loadProposal(proposalId);
  if (!p) throw new Error("Proposal not found");

  const target = nextStage(p.stage);
  if (!target) {
    throw new Error(
      `Stage "${p.stage}" is not automatically advanceable — it needs a human decision.`
    );
  }

  await record(proposalId, target, "STARTED");

  try {
    const data: Record<string, unknown> = {
      stage: target,
      stageChangedAt: new Date(),
      failureReason: null,
    };

    if (target === "ANALYZING") {
      const { content, engine } = await runAnalyzer(p);
      data.requirements = content;
      data.generatedBy = engine;
      // What was actually said about money on the call outranks the catalogue.
      const quoted =
        extractQuotedPricing(content) ??
        sweepPricingLines(p.transcript?.rawTranscript ?? "");
      if (quoted) data.quotedPricing = quoted;
    } else if (target === "RESEARCHING") {
      const { content, engine } = await runResearch(p);
      data.research = content;
      if (engine === "ANTHROPIC") data.generatedBy = engine;
    } else if (target === "DRAFTING") {
      const { content, engine } = await runWriter(p);
      data.draftContent = content;
      if (engine === "ANTHROPIC") data.generatedBy = engine;
    } else if (target === "FORMATTING") {
      const { content } = await runFormatter(p);
      data.formatted = content;
    }
    // REVIEW carries no generation — it is the human gate.

    const updated = await prisma.proposal.update({ where: { id: proposalId }, data });
    await record(proposalId, target, "COMPLETED");
    return updated;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await record(proposalId, target, "FAILED", message);
    await prisma.proposal.update({
      where: { id: proposalId },
      data: { failureReason: message },
    });
    throw err;
  }
}

/** Runs the pipeline to the human-review gate, one stage at a time. */
export async function runToReview(proposalId: string, maxSteps = 6) {
  let current = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: { stage: true },
  });
  let steps = 0;
  while (current && nextStage(current.stage) && steps < maxSteps) {
    await advanceProposal(proposalId);
    current = await prisma.proposal.findUnique({
      where: { id: proposalId },
      select: { stage: true },
    });
    steps++;
  }
  return prisma.proposal.findUnique({ where: { id: proposalId } });
}

/**
 * Phase 4 — Delivery. Creates or links a CRM Opportunity on the product's own
 * pipeline. Human-triggered by design: nothing reaches the CRM automatically.
 */
export async function deliverProposal(proposalId: string, ownerIdOverride?: string) {
  const p = await loadProposal(proposalId);
  if (!p) throw new Error("Proposal not found");
  if (p.stage !== "APPROVED") {
    throw new Error("Only approved proposals can be delivered.");
  }

  let accountId = p.accountId;
  if (!accountId) {
    const name = (p.clientName ?? p.title).trim();
    const existing = await prisma.account.findFirst({ where: { name } });
    accountId =
      existing?.id ??
      (
        await prisma.account.create({
          data: { name, ownerId: p.ownerId ?? ownerIdOverride ?? null },
        })
      ).id;
  }

  // Place the opportunity on the correct product pipeline at its first stage.
  const { getPipelineForProduct } = await import("@/lib/catalog");
  const pipeline = await getPipelineForProduct(p.product);
  const stage = pipeline.stages.find((s) => s.active && !s.isWon && !s.isLost)!;

  const opportunity = await prisma.opportunity.create({
    data: {
      name: p.title,
      product: p.product,
      pipelineId: pipeline.id,
      stageId: stage.id,
      stage: stage.key,
      probability: stage.defaultProbability,
      value: p.estimatedValue,
      accountId,
      ownerId: p.ownerId ?? ownerIdOverride ?? null,
      notes: `Generated from proposal "${p.title}".`,
      nextAction: "Send proposal and confirm receipt",
    },
  });

  // Draft cover email — a draft on purpose. Nothing is ever sent automatically.
  const client = p.clientName ?? p.account?.name ?? "there";
  const modelEmail = await complete({
    model: WRITER_MODEL,
    system: `Write a short, warm covering email accompanying a proposal. 120 words maximum.
Reference specifics from the proposal. No subject-line clichés, no hype. British English.
Output plain text starting with "Subject: ".`,
    prompt: `Client: ${client}
Business line: ${productLabel(p.product)}
Proposal title: ${p.title}

Proposal content:
${(p.formatted ?? p.draftContent ?? "").slice(0, 6000)}`,
    maxTokens: 500,
  });

  const emailDraft =
    modelEmail ??
    `Subject: ${p.title}

Hi ${client},

Thank you for your time on the call. As discussed, I've attached our proposal covering
${productLabel(p.product)}.

It sets out our understanding of your requirements, the proposed approach and next steps.
Happy to walk through it whenever suits — just let me know.

Best regards`;

  const updated = await prisma.proposal.update({
    where: { id: proposalId },
    data: {
      stage: "DELIVERED",
      stageChangedAt: new Date(),
      accountId,
      opportunityId: opportunity.id,
      emailDraft,
    },
  });
  await record(proposalId, "DELIVERED", "COMPLETED", `Opportunity ${opportunity.id} created`);

  // Log the delivery as a CRM activity so it shows in the account timeline.
  await prisma.activity.create({
    data: {
      type: "NOTE",
      subject: `Proposal delivered: ${p.title}`,
      notes: "Created from the automated proposal pipeline.",
      accountId,
      opportunityId: opportunity.id,
      ownerId: p.ownerId ?? ownerIdOverride ?? null,
    },
  });

  return { proposal: updated, opportunity };
}
