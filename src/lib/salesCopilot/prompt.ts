/**
 * Sales Copilot — prompt construction, safety instructions, and template
 * fallbacks (Sprint 06C, Phases 4/5/7/9/10).
 *
 * Human-in-the-loop: every action here is DRAFT + RECOMMEND only. Nothing in
 * this module writes to the CRM, sends anything externally, or calls any
 * provider other than the one already integrated for the Proposals pipeline
 * (`src/lib/proposals/llm.ts`) — reused as-is rather than adding a second
 * provider or a new SDK dependency.
 */
import { complete, parseJsonBlock, WRITER_MODEL } from "@/lib/proposals/llm";
import type { SalesContext } from "./context";

export const SALES_COPILOT_ACTIONS = ["NEXT_ACTION", "DRAFT_EMAIL", "MEETING_OBJECTIVE"] as const;
export type SalesCopilotAction = (typeof SALES_COPILOT_ACTIONS)[number];

export function isSalesCopilotAction(v: unknown): v is SalesCopilotAction {
  return typeof v === "string" && (SALES_COPILOT_ACTIONS as readonly string[]).includes(v);
}

export type NextActionResult = {
  recommendedAction: string;
  why: string;
  objective: string;
  timing: string;
  taskSuggestion: string | null;
};

export type DraftEmailResult = {
  subject: string;
  body: string;
  objective: string;
  keyContextUsed: string[];
  missingContext: string | null;
};

export type MeetingObjectiveResult = {
  objective: string;
  questions: string[];
  knownContext: string;
  desiredNextStep: string;
  risks: string[];
};

// ─── System instruction (Phase 9 — CRM truth) ───────────────────────────────

const SYSTEM_INSTRUCTION = `You are a sales copilot embedded in ArqOne CRM, helping a founder-led sales
team decide what to do next and draft communications. You assist by reading
CRM context and producing recommendations and drafts — you never take action
yourself.

CRM TRUTH RULES (must follow exactly):
- The CRM context provided below is the ONLY source of facts. Never invent
  facts that are not present in it.
- Clearly distinguish stated facts (from the CRM) from your own
  recommendations — label recommendations as recommendations, not as things
  that have happened.
- Never claim a client agreed to, requested, or committed to anything unless
  the CRM context explicitly states it (e.g. via an Activity or a client
  commitment date). A high relationshipStrength or an open Task does NOT mean
  the client committed to anything — do not infer commitment from warmth.
- Never fabricate commercial value, pricing, or deal size beyond what the
  context provides.
- Never fabricate a contact's job title, role, or authority beyond what the
  context provides.
- Never describe a deal, meeting, or task as already completed unless the
  CRM context says so — if a follow-up hasn't happened yet, say that it
  hasn't happened yet.
- If the context is insufficient to complete part of the request, say
  explicitly what is missing rather than inventing it.
- You do not send emails, change Lead status, change Opportunity stage,
  create Opportunities, or create Tasks. Everything you produce is a draft
  or recommendation for a human to review and act on.

Respond with a single JSON object only, matching the schema described in the
user message. No prose outside the JSON.`;

function contextBlock(ctx: SalesContext): string {
  const lines: string[] = [];
  lines.push(`Entity: ${ctx.entityType} (id ${ctx.entityId})`);
  if (ctx.contactName) lines.push(`Contact: ${ctx.contactName}`);
  if (ctx.jobTitle) lines.push(`Job title: ${ctx.jobTitle}`);
  if (ctx.accountName) lines.push(`Account/company: ${ctx.accountName}`);
  if (ctx.leadStatus) lines.push(`Lead status: ${ctx.leadStatus}`);
  if (ctx.opportunityStage) lines.push(`Opportunity stage: ${ctx.opportunityStage}`);
  if (ctx.productLabel) lines.push(`Product/business line: ${ctx.productLabel}`);
  if (ctx.relationshipStrength) lines.push(`Relationship strength: ${ctx.relationshipStrength}`);
  if (ctx.sourceType) lines.push(`Source type: ${ctx.sourceType}${ctx.sourceDetail ? ` (${ctx.sourceDetail})` : ""}`);
  if (ctx.acquisitionPath) lines.push(`Acquisition path: ${ctx.acquisitionPath}`);
  if (ctx.referredByName) lines.push(`Referred by: ${ctx.referredByName}`);
  if (ctx.primaryContactName && ctx.primaryContactName !== ctx.contactName) {
    lines.push(`Primary contact/stakeholder: ${ctx.primaryContactName}`);
  }
  if (ctx.opportunityContext) {
    const o = ctx.opportunityContext;
    lines.push(`Existing opportunity: "${o.name}", stage ${o.stage}, health ${o.healthStatus}${o.value ? `, value ~$${o.value}` : ""}`);
  }
  if (ctx.useCase) lines.push(`Known use case: ${ctx.useCase}`);
  if (ctx.notes) lines.push(`Notes on file: ${ctx.notes}`);
  lines.push(`Last interaction: ${ctx.lastInteractionSummary ?? "none recorded"}${ctx.lastInteractionDate ? ` on ${ctx.lastInteractionDate.slice(0, 10)}` : ""}`);

  if (ctx.recentActivities.length) {
    lines.push("Recent activities (newest first):");
    for (const a of ctx.recentActivities) {
      lines.push(`  - [${a.date.slice(0, 10)}] ${a.type}: ${a.subject}${a.notes ? ` — ${a.notes}` : ""}`);
    }
  } else {
    lines.push("Recent activities: none recorded.");
  }

  if (ctx.openTasks.length) {
    lines.push("Open tasks:");
    for (const t of ctx.openTasks) {
      lines.push(`  - ${t.title}${t.dueDate ? ` (due ${t.dueDate.slice(0, 10)})` : ""}${t.clientCommitmentDate ? ` [client committed to ${t.clientCommitmentDate.slice(0, 10)}]` : ""}`);
    }
  } else {
    lines.push("Open tasks: none.");
  }

  if (ctx.nextDueTask) {
    lines.push(`Next due task: ${ctx.nextDueTask.title}${ctx.nextDueTask.dueDate ? ` (${ctx.nextDueTask.dueDate.slice(0, 10)})` : ""}`);
  }

  return lines.join("\n");
}

function safeJson<T>(text: string | null, fallback: T): T {
  const parsed = parseJsonBlock<T>(text);
  return parsed ?? fallback;
}

// ─── NEXT_ACTION ─────────────────────────────────────────────────────────────

function nextActionTemplate(ctx: SalesContext): NextActionResult {
  const who = ctx.contactName ?? "this contact";
  if (!ctx.recentActivities.length) {
    return {
      recommendedAction: `Reach out to ${who} to open the relationship.`,
      why: "No activities are recorded yet, so there is no interaction history to build on.",
      objective: "Establish first contact and understand their current interest.",
      timing: "This week.",
      taskSuggestion: `Log the first outreach to ${who} once sent.`,
    };
  }
  const last = ctx.lastInteractionSummary ?? "the last recorded interaction";
  const hasOpenTask = ctx.openTasks.length > 0;
  return {
    recommendedAction: hasOpenTask
      ? `Follow up on the open task: ${ctx.openTasks[0].title}.`
      : `Send ${who} a follow-up referencing ${last}.`,
    why: hasOpenTask
      ? "There is already an open task recorded — that is the next committed action."
      : `The last recorded interaction was ${last}${ctx.lastInteractionDate ? ` on ${ctx.lastInteractionDate.slice(0, 10)}` : ""}, with no follow-up logged since.`,
    objective: ctx.opportunityContext
      ? `Advance the "${ctx.opportunityContext.name}" opportunity to its next stage.`
      : "Move the relationship forward and confirm next steps.",
    timing: "Today.",
    taskSuggestion: hasOpenTask ? null : `Follow up with ${who}.`,
  };
}

export async function runNextAction(ctx: SalesContext): Promise<NextActionResult> {
  const fallback = nextActionTemplate(ctx);
  const prompt = `CRM context:\n${contextBlock(ctx)}\n\nTask: recommend the single next action to take.
Respond as JSON with exactly these keys:
{
  "recommendedAction": "one sentence — the specific next action",
  "why": "one or two sentences — grounded in the CRM context above, not speculation",
  "objective": "one sentence — what this action is meant to achieve",
  "timing": "one short phrase — e.g. 'Today', 'This week', 'Next touchpoint'",
  "taskSuggestion": "an optional short task title if a follow-up task would be useful, or null"
}
This is advisory only — you are not creating or modifying any CRM record.`;

  const text = await complete({ model: WRITER_MODEL, system: SYSTEM_INSTRUCTION, prompt, maxTokens: 800 });
  return safeJson<NextActionResult>(text, fallback);
}

// ─── DRAFT_EMAIL ─────────────────────────────────────────────────────────────

function draftEmailTemplate(ctx: SalesContext): DraftEmailResult {
  const who = ctx.contactName ?? "there";
  const firstName = who.split(" ")[0];
  const account = ctx.accountName ? ` at ${ctx.accountName}` : "";
  const missing: string[] = [];
  if (!ctx.recentActivities.length) missing.push("no recorded activity to reference");
  if (!ctx.contactName) missing.push("no contact name on file");

  const body = ctx.lastInteractionSummary
    ? `Hi ${firstName},\n\nFollowing up after ${ctx.lastInteractionSummary.toLowerCase()}${ctx.lastInteractionDate ? ` on ${ctx.lastInteractionDate.slice(0, 10)}` : ""}. Wanted to check in on next steps${account ? ` for ${ctx.accountName}` : ""}.\n\nHappy to set up time this week if useful.\n\nBest,\n`
    : `Hi ${firstName},\n\nReaching out to introduce ArqOne${account ? ` and explore how we might support ${ctx.accountName}` : ""}. Let me know if a short call this week would be useful.\n\nBest,\n`;

  return {
    subject: ctx.opportunityContext ? `Following up — ${ctx.opportunityContext.name}` : `Following up${account}`,
    body,
    objective: ctx.opportunityContext ? `Advance the "${ctx.opportunityContext.name}" opportunity.` : "Re-engage and confirm interest.",
    keyContextUsed: [ctx.lastInteractionSummary, ctx.accountName, ctx.opportunityContext?.name].filter(Boolean) as string[],
    missingContext: missing.length ? missing.join("; ") : null,
  };
}

export async function runDraftEmail(ctx: SalesContext): Promise<DraftEmailResult> {
  const fallback = draftEmailTemplate(ctx);
  const prompt = `CRM context:\n${contextBlock(ctx)}\n\nTask: draft a follow-up email using ONLY the CRM context above.
Tone: professional, concise, natural — not generic AI language, no exaggerated
sales claims, no fabricated client statements, no invented meetings, no
invented promises, no invented stakeholder interest. If there isn't enough
context to write a grounded email, say what's missing in "missingContext"
rather than inventing detail.
Respond as JSON with exactly these keys:
{
  "subject": "email subject line",
  "body": "full email body, plain text, ready to review and edit",
  "objective": "one sentence — the communication objective",
  "keyContextUsed": ["short phrase", "short phrase", "..."],
  "missingContext": "what's missing to make this stronger, or null if nothing is missing"
}
This is a draft only — nothing is sent.`;

  const text = await complete({ model: WRITER_MODEL, system: SYSTEM_INSTRUCTION, prompt, maxTokens: 1200 });
  return safeJson<DraftEmailResult>(text, fallback);
}

// ─── MEETING_OBJECTIVE ───────────────────────────────────────────────────────

function meetingObjectiveTemplate(ctx: SalesContext): MeetingObjectiveResult {
  const who = ctx.contactName ?? "the contact";
  return {
    objective: ctx.opportunityContext
      ? `Move "${ctx.opportunityContext.name}" forward with ${who}.`
      : `Understand ${who}'s current priorities and interest.`,
    questions: [
      "What's changed on your side since we last spoke?",
      "Who else is involved in this decision?",
      "What would need to be true for this to move forward?",
      ...(ctx.opportunityContext ? ["What's the timeline you're working against?"] : []),
    ],
    knownContext: contextBlock(ctx),
    desiredNextStep: ctx.openTasks[0]?.title ?? "Agree a concrete next step and date.",
    risks: ctx.recentActivities.length ? [] : ["No prior activity on file — treat this as an early-stage conversation."],
  };
}

export async function runMeetingObjective(ctx: SalesContext): Promise<MeetingObjectiveResult> {
  const fallback = meetingObjectiveTemplate(ctx);
  const prompt = `CRM context:\n${contextBlock(ctx)}\n\nTask: prepare a concise meeting brief to read immediately before the meeting.
Respond as JSON with exactly these keys:
{
  "objective": "one sentence — the meeting objective",
  "questions": ["3 to 5 short questions to ask, grounded in the context"],
  "knownContext": "a short paragraph summarizing what's known about this client, facts only",
  "desiredNextStep": "one sentence — what a good outcome looks like",
  "risks": ["short bullet", "short bullet", "..."]
}
Keep it concise enough to read in under a minute. This is advisory only.`;

  const text = await complete({ model: WRITER_MODEL, system: SYSTEM_INSTRUCTION, prompt, maxTokens: 900 });
  return safeJson<MeetingObjectiveResult>(text, fallback);
}
