/**
 * Approved-send service logic (Sprint 06D, Phase 5/6/8) — split out of the
 * API route so it can be exercised in tests with a fake EmailProvider
 * instead of real Zoho credentials. The route (src/app/api/email/send)
 * is a thin adapter: parse the request, call this, map the result to an
 * HTTP response.
 */
import { prisma } from "@/lib/prisma";
import { EmailProvider, EmailSendError } from "./provider";

const MAX_BODY_LENGTH = 20_000;
const MAX_SUBJECT_LENGTH = 500;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(addr: unknown): addr is string {
  return typeof addr === "string" && addr.length <= 320 && EMAIL_RE.test(addr);
}

export type SendApprovedEmailInput = {
  entityType?: "LEAD" | "CONTACT" | "OPPORTUNITY" | null;
  entityId?: string | null;
  contactId: string;
  to: string;
  cc?: string | null;
  subject: string;
  plaintextBody: string;
  idempotencyKey: string;
  taskId?: string | null;
};

export type SendApprovedEmailResult =
  | { ok: true; status: 200 | 201; activity: unknown; providerMessageId: string | null; relatedTaskId: string | null; replay: boolean }
  | { ok: false; status: 400 | 404 | 502 | 503; error: string };

export function validateSendInput(input: SendApprovedEmailInput): string | null {
  if (!input.contactId) return "contactId is required — the recipient must be a CRM Contact.";
  if (!isValidEmail(input.to)) return "A valid recipient email address is required.";
  if (input.cc && !isValidEmail(input.cc)) return "CC must be a valid email address.";
  if (!input.subject?.trim()) return "Subject is required.";
  if (input.subject.length > MAX_SUBJECT_LENGTH) return "Subject is too long.";
  if (!input.plaintextBody?.trim()) return "Body is required.";
  if (input.plaintextBody.length > MAX_BODY_LENGTH) return "Body is too long.";
  if (!input.idempotencyKey) return "idempotencyKey is required.";
  return null;
}

export async function sendApprovedEmail(
  input: SendApprovedEmailInput,
  provider: EmailProvider | null
): Promise<SendApprovedEmailResult> {
  const validationError = validateSendInput(input);
  if (validationError) return { ok: false, status: 400, error: validationError };

  // Idempotent replay: this exact approved request already produced an
  // Activity — return it rather than sending a second time.
  const existing = await prisma.activity.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    return { ok: true, status: 200, activity: existing, providerMessageId: existing.providerMessageId, relatedTaskId: null, replay: true };
  }

  const contact = await prisma.contact.findUnique({ where: { id: input.contactId } });
  if (!contact) return { ok: false, status: 404, error: `Contact ${input.contactId} not found.` };

  let lead = null;
  let opportunity = null;
  if (input.entityType === "LEAD" && input.entityId) {
    lead = await prisma.lead.findUnique({ where: { id: input.entityId } });
    if (!lead) return { ok: false, status: 404, error: `Lead ${input.entityId} not found.` };
  }
  if (input.entityType === "OPPORTUNITY" && input.entityId) {
    opportunity = await prisma.opportunity.findUnique({ where: { id: input.entityId } });
    if (!opportunity) return { ok: false, status: 404, error: `Opportunity ${input.entityId} not found.` };
  }

  let relatedTaskId: string | null = null;
  if (input.taskId) {
    const task = await prisma.task.findUnique({ where: { id: input.taskId } });
    if (!task) return { ok: false, status: 404, error: `Task ${input.taskId} not found.` };
    relatedTaskId = task.id;
  }

  if (!provider) {
    return { ok: false, status: 503, error: "Email sending is not configured. Set the ZOHO_* environment variables to enable it." };
  }

  let providerMessageId: string | null = null;
  try {
    const result = await provider.sendEmail({ to: input.to, cc: input.cc ?? undefined, subject: input.subject, body: input.plaintextBody });
    providerMessageId = result.providerMessageId;
  } catch (err) {
    const message = err instanceof EmailSendError ? err.message : "Failed to send email.";
    // No Activity is created on failure — the draft is preserved client-side.
    return { ok: false, status: 502, error: message };
  }

  // Only after a confirmed send do we record anything in the CRM.
  const activity = await prisma.activity.create({
    data: {
      type: "EMAIL",
      subject: input.subject,
      notes: input.plaintextBody,
      date: new Date(),
      accountId: contact.accountId,
      contactId: contact.id,
      leadId: lead?.id ?? null,
      opportunityId: opportunity?.id ?? null,
      product: lead?.primaryProduct ?? opportunity?.product ?? null,
      idempotencyKey: input.idempotencyKey,
      providerMessageId,
    },
  });

  if (lead) {
    await prisma.lead.update({ where: { id: lead.id }, data: { lastActivityAt: activity.date } });
  }

  return { ok: true, status: 201, activity, providerMessageId, relatedTaskId, replay: false };
}
