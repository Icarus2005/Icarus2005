import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { EmailProvider } from "@/lib/email/provider";
import { isValidEmail } from "@/lib/email/sendApprovedEmail";
import { actualDate, choice, followupDate, money, parseDrafts, parseImport, PRIORITIES, requiredText, ROUND_KEY, ROUND_KEYS, fundraisingRound, RoundKey, SEND_KINDS, SendKind, STATUSES } from "./rules";

type Tx = Prisma.TransactionClient;
export class FundraisingError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
async function locked(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "FundraisingProspect" WHERE id = ${id} FOR UPDATE`;
  const p = await tx.fundraisingProspect.findUnique({ where: { id }, include: { contact: true } });
  if (!p || !ROUND_KEYS.includes(p.roundKey as RoundKey)) throw new FundraisingError("Fundraising route not found.", 404);
  return p;
}
type Prospect = Awaited<ReturnType<typeof locked>>;
function taskId(id: string, n: number) { return `fundraise_${id}_${n}`; }
async function stopTasks(tx: Tx, id: string) {
  // Do not close unrelated relationship tasks, only the two system follow-ups.
  await tx.task.updateMany({ where: { id: { in: [taskId(id, 1), taskId(id, 2)] }, status: "OPEN" }, data: { status: "DONE" } });
}
async function validateSend(tx: Tx, p: Prospect, kind: SendKind) {
  if (kind === "RESPONSE") {
    if (!p.firstSentAt || !["REPLIED", "MEETING", "DILIGENCE", "COMMITTED"].includes(p.status)) throw new FundraisingError("Responses require an existing investor conversation.");
    return;
  }
  if (p.priority === "Hold" || ["REJECTED", "PAUSED", "HOLD", "COMMITTED"].includes(p.status)) throw new FundraisingError("This route is stopped. Review its status and priority before outreach.");
  if (kind === "INITIAL" && p.firstSentAt) throw new FundraisingError("An initial send is already recorded.");
  if (kind !== "INITIAL") {
    if (p.status !== "CONTACTED" || !p.firstSentAt || p.lastReplyAt) throw new FundraisingError("No unanswered sequence is active.");
    const n = kind === "FOLLOWUP_1" ? 1 : 2;
    const task = await tx.task.findUnique({ where: { id: taskId(p.id, n) } });
    if (!task || task.status !== "OPEN") throw new FundraisingError("This follow-up is already closed.");
    if (n === 2) {
      const first = await tx.task.findUnique({ where: { id: taskId(p.id, 1) } });
      if (first?.status === "OPEN") throw new FundraisingError("Record or close the first follow-up before the final follow-up.");
    }
  }
}
async function recordSend(tx: Tx, p: Prospect, data: { kind: SendKind; subject: string; body: string; channel: string; at: Date; key: string; providerMessageId?: string | null }) {
  const activity = await tx.activity.create({ data: {
    type: data.channel, subject: data.subject, notes: data.body, date: data.at,
    product: fundraisingRound(p.roundKey).product, fundraisingProspectId: p.id, contactId: p.contactId,
    accountId: p.contact?.accountId, idempotencyKey: data.key, providerMessageId: data.providerMessageId,
  } });
  // A reply/pause recorded while a provider call was in flight must still stop the sequence.
  const stopped = ["REPLIED", "MEETING", "DILIGENCE", "COMMITTED", "REJECTED", "PAUSED", "HOLD"].includes(p.status);
  await tx.fundraisingProspect.update({ where: { id: p.id }, data: {
    firstSentAt: p.firstSentAt ?? data.at, lastSentAt: data.at,
    ...(!stopped ? { status: data.kind === "FOLLOWUP_2" ? "PAUSED" : "CONTACTED" } : {}),
  } });
  if (data.kind === "INITIAL" && !stopped) {
    for (const n of [1, 2]) await tx.task.create({ data: {
      id: taskId(p.id, n), title: `${p.name}: ${n === 1 ? "first" : "final"} fundraising follow-up`,
      notes: "Review and send manually. Mon-Fri business days in Dubai; no holiday calendar. Stop on reply. No automatic sending.",
      dueDate: followupDate(data.at, n * 5), product: fundraisingRound(p.roundKey).product, fundraisingProspectId: p.id,
      contactId: p.contactId, accountId: p.contact?.accountId,
    } });
  } else if (data.kind === "FOLLOWUP_1" || data.kind === "FOLLOWUP_2") {
    await tx.task.updateMany({ where: { id: taskId(p.id, data.kind === "FOLLOWUP_1" ? 1 : 2) }, data: { status: "DONE" } });
  }
  if (stopped || data.kind === "FOLLOWUP_2") await stopTasks(tx, p.id);
  return activity;
}

export async function importProspects(input: unknown, preview: boolean, roundKey: RoundKey = ROUND_KEY) {
  const rows = parseImport(input);
  const existing = await prisma.fundraisingProspect.findMany({ where: { roundKey, sourceKey: { in: rows.map(r => r.sourceKey) } }, select: { sourceKey: true } });
  const found = new Set(existing.map(p => p.sourceKey));
  if (preview) return rows.map(r => ({ ...r, operation: found.has(r.sourceKey) ? "SKIP_EXISTING" : "CREATE" }));
  // Unique source key + createMany skipDuplicates makes concurrent/repeated imports safe.
  return prisma.fundraisingProspect.createMany({ data: rows.map(r => ({ ...r, roundKey })), skipDuplicates: true });
}

export async function updateProspect(id: string, input: Record<string, unknown>) {
  const status = choice(input.status, STATUSES, "status");
  const priority = choice(input.priority, PRIORITIES, "priority");
  const nextAction = requiredText(input.nextAction, "next action");
  const notes = requiredText(input.notes || "No additional notes.", "notes");
  const committedUsd = money(input.committedUsd);
  const receivedUsd = money(input.receivedUsd);
  if (receivedUsd > committedUsd) throw new FundraisingError("Received capital cannot exceed confirmed commitments.");
  const capitalEvidence = typeof input.capitalEvidence === "string" ? input.capitalEvidence.trim() : "";
  if ((committedUsd > 0 || receivedUsd > 0 || status === "COMMITTED") && !capitalEvidence) throw new FundraisingError("Record evidence before confirming capital.");
  const drafts = parseDrafts(input.drafts);
  const contactId = input.contactId ? requiredText(input.contactId, "contact ID", 100) : null;
  return prisma.$transaction(async tx => {
    const p = await locked(tx, id);
    if (status === "CONTACTED" && p.status !== "CONTACTED") throw new FundraisingError("Use a confirmed send to start a follow-up sequence.");
    if (contactId && !await tx.contact.findUnique({ where: { id: contactId } })) throw new FundraisingError("Contact not found.", 404);
    const result = await tx.fundraisingProspect.update({ where: { id }, data: { status, priority, nextAction, notes, drafts, contactId, committedUsd, receivedUsd, capitalEvidence } });
    await tx.task.updateMany({ where: { fundraisingProspectId: id, status: "OPEN" }, data: { contactId, accountId: contactId ? (await tx.contact.findUniqueOrThrow({ where: { id: contactId } })).accountId : null } });
    if (status !== "CONTACTED" || priority === "Hold") await stopTasks(tx, p.id);
    return result;
  });
}

export async function logEvent(id: string, input: Record<string, unknown>) {
  const action = choice(input.action, ["LOG_SENT", "REPLY", "REJECT", "PAUSE"], "action");
  const key = `fundraising:${action}:${requiredText(input.key, "request key", 120)}`;
  const at = actualDate(input.at);
  const subject = requiredText(input.subject, "subject", 500);
  const body = requiredText(input.body, "message / evidence");
  const channel = choice(input.channel, ["EMAIL", "LINKEDIN", "WHATSAPP", "CALL", "MEETING", "NOTE"], "channel");
  return prisma.$transaction(async tx => {
    const p = await locked(tx, id);
    const prior = await tx.activity.findUnique({ where: { idempotencyKey: key } });
    if (prior) {
      if (prior.fundraisingProspectId !== id || prior.notes !== body || prior.subject !== subject || prior.type !== channel || prior.date.getTime() !== at.getTime()) throw new FundraisingError("Request key already used for a different event.", 409);
      return prior;
    }
    if (action === "LOG_SENT") {
      if (input.confirmed !== true) throw new FundraisingError("Confirm the message was actually sent.");
      const pending = await tx.fundraisingDispatch.findFirst({ where: { prospectId: id, state: { in: ["SENDING", "UNCERTAIN"] } } });
      if (pending) throw new FundraisingError("Reconcile the pending delivery before logging another send.", 409);
      const kind = choice(input.kind, SEND_KINDS, "send kind");
      await validateSend(tx, p, kind);
      if (p.lastSentAt && at < p.lastSentAt) throw new FundraisingError("Send timestamp predates the last recorded send.");
      return recordSend(tx, p, { kind, subject, body, channel, at, key });
    }
    const result = await tx.activity.create({ data: { type: channel, subject, notes: body, date: at, product: fundraisingRound(p.roundKey).product, fundraisingProspectId: id, contactId: p.contactId, accountId: p.contact?.accountId, idempotencyKey: key } });
    await tx.fundraisingProspect.update({ where: { id }, data: { status: action === "REPLY" ? "REPLIED" : action === "REJECT" ? "REJECTED" : "PAUSED", ...(action === "REPLY" ? { lastReplyAt: at } : {}) } });
    await stopTasks(tx, id);
    return result;
  });
}

export async function sendFundraisingEmail(id: string, input: Record<string, unknown>, provider: EmailProvider | null) {
  if (input.approved !== true || input.conditionsConfirmed !== true) throw new FundraisingError("Review the recipient, content and draft sending conditions before approval.");
  if (!provider) throw new FundraisingError("Zoho sending is not configured.", 503);
  const key = requiredText(input.key, "request key", 120);
  const subject = requiredText(input.subject, "subject", 500);
  const body = requiredText(input.body, "body");
  const kind = choice(input.kind, SEND_KINDS, "send kind");
  if (kind !== "INITIAL") throw new FundraisingError("Send follow-up replies in the existing Zoho thread, then record the confirmed send.");
  const to = requiredText(input.to, "recipient", 320).toLowerCase();
  if (!isValidEmail(to)) throw new FundraisingError("A valid recipient email is required.");
  const payload = { subject, body, kind, to };
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const claim = await prisma.$transaction(async tx => {
    const p = await locked(tx, id);
    const prior = await tx.fundraisingDispatch.findUnique({ where: { id: key } });
    if (prior) {
      if (prior.prospectId !== id || prior.payloadHash !== hash) throw new FundraisingError("Request key belongs to different content.", 409);
      if (prior.state === "SENT") return { replay: true };
      throw new FundraisingError("Delivery pending or uncertain. Check Zoho Sent and reconcile; do not retry.", 409);
    }
    if (p.sourceStatus === "Submitted previously") throw new FundraisingError("Use the original submission thread in Zoho, then record the confirmed send.");
    if (!p.contact?.email || p.contact.email.toLowerCase() !== to) throw new FundraisingError("Recipient must match the linked CRM contact email.");
    // Serialize claim checks by recipient email even when two different venture
    // routes are sending concurrently. This must happen within the claim transaction.
    // PG advisory transaction locks automatically release on COMMIT or ROLLBACK.
    await tx.$queryRaw`SELECT 1::integer AS locked FROM pg_advisory_xact_lock(hashtext(${to})::bigint)`;
    // Same investor email may be represented by different CRM contacts across ventures.
    // Do not silently pitch a second venture when a verified first outreach exists.
    // The operator may use the existing thread outside this sender and log its actual outcome.
    const otherVentureSend = await tx.fundraisingProspect.findFirst({
      where: {
        id: { not: p.id },
        roundKey: { in: ROUND_KEYS.filter(key => key !== p.roundKey) },
        firstSentAt: { not: null },
        contact: { is: { email: { equals: to, mode: "insensitive" } } },
      },
      select: { id: true },
    });
    const otherVenturePending = await tx.fundraisingDispatch.findFirst({
      where: {
        state: { in: ["SENDING", "UNCERTAIN"] },
        prospect: {
          is: {
            roundKey: { in: ROUND_KEYS.filter(key => key !== p.roundKey) },
            contact: { is: { email: { equals: to, mode: "insensitive" } } },
          },
        },
      },
      select: { id: true },
    });
    if (otherVentureSend || otherVenturePending) throw new FundraisingError(
      "This investor has recorded or pending outreach for the other venture. Review that conversation before any new email. Use the existing thread and record the actual event manually.",
      409,
    );
    await validateSend(tx, p, kind);
    if (await tx.fundraisingDispatch.findFirst({ where: { prospectId: id, state: { in: ["SENDING", "UNCERTAIN"] } } })) throw new FundraisingError("Another delivery is unresolved for this route.", 409);
    await tx.fundraisingDispatch.create({ data: { id: key, prospectId: id, payloadHash: hash, payload } });
    return { replay: false };
  });
  if (claim.replay) return claim;
  let providerMessageId: string | null = null;
  try {
    const result = await provider.sendEmail({ to, subject, body });
    providerMessageId = result.providerMessageId;
    await prisma.$transaction(async tx => {
      const p = await locked(tx, id);
      await recordSend(tx, p, { ...payload, channel: "EMAIL", at: new Date(), key: `fundraising-send:${key}`, providerMessageId });
      await tx.fundraisingDispatch.update({ where: { id: key }, data: { state: "SENT", providerMessageId } });
    });
    return { replay: false };
  } catch {
    await prisma.fundraisingDispatch.updateMany({ where: { id: key, state: "SENDING" }, data: { state: "UNCERTAIN", providerMessageId } });
    throw new FundraisingError("Delivery outcome is uncertain. Check Zoho Sent and reconcile before another send.", 502);
  }
}

export async function reconcileDelivery(id: string, input: Record<string, unknown>) {
  const dispatchId = requiredText(input.dispatchId, "delivery ID", 120);
  const evidence = requiredText(input.evidence, "Sent-folder verification evidence");
  const outcome = choice(input.outcome, ["SENT", "NOT_SENT"], "verified outcome");
  const at = actualDate(input.at);
  return prisma.$transaction(async tx => {
    const p = await locked(tx, id);
    const attempt = await tx.fundraisingDispatch.findUnique({ where: { id: dispatchId } });
    if (!attempt || attempt.prospectId !== id || !["SENDING", "UNCERTAIN"].includes(attempt.state)) throw new FundraisingError("No unresolved delivery found.", 409);
    // Give an active provider request time to finish before manual intervention.
    if (Date.now() - attempt.createdAt.getTime() < 10 * 60_000) throw new FundraisingError("Wait ten minutes after the attempt before reconciling an in-flight request.", 409);
    if (outcome === "SENT") {
      const payload = attempt.payload as { kind: SendKind; subject: string; body: string };
      await recordSend(tx, p, { ...payload, channel: "EMAIL", at, key: `fundraising-send:${dispatchId}`, providerMessageId: attempt.providerMessageId });
    }
    await tx.activity.create({ data: { type: "NOTE", subject: `Delivery reconciled: ${outcome}`, notes: evidence, fundraisingProspectId: id, product: fundraisingRound(p.roundKey).product, date: new Date(), contactId: p.contactId, accountId: p.contact?.accountId } });
    return tx.fundraisingDispatch.update({ where: { id: dispatchId }, data: { state: outcome === "SENT" ? "SENT" : "NOT_SENT" } });
  });
}
