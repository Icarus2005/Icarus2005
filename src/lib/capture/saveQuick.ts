import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeName } from "@/lib/normalize";
import { isProductKey } from "@/lib/products";
import { LIVE_X_CONTEXT } from "./quick";

export type QuickSaveInput = {
  idempotencyKey: string;
  ownerId: string;
  transcript: string;
  eventName: string;
  eventDate: string;
  location: string;
  personName: string;
  companyName: string;
  statedRole: string;
  productKey: string;
  conversationSummary: string;
  relationshipContext: string;
  theirCommitment: string;
  myCommitment: string;
  nextAction: string;
  dueDate: string;
  notes: string;
  email: string;
  phone: string;
  contactId: string;
  accountId: string;
};

export type QuickSaveResult = { activityId: string; taskId: string | null; contactId: string | null; leadId: string | null; accountId: string | null };

export class QuickCaptureError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
}

export async function saveQuickCapture(input: QuickSaveInput): Promise<QuickSaveResult> {
  if (!/^[0-9a-f-]{36}$/i.test(input.idempotencyKey)) throw new QuickCaptureError("Invalid capture key.");
  if (!input.ownerId) throw new QuickCaptureError("Choose the CRM owner before saving.");
  if (!input.transcript.trim() || input.transcript.length > 5000) throw new QuickCaptureError("Debrief must be 1–5000 characters.");
  if (input.eventDate && !validDate(input.eventDate)) throw new QuickCaptureError("Invalid event date.");
  if (input.dueDate && !validDate(input.dueDate)) throw new QuickCaptureError("Invalid task due date.");
  if (input.productKey && !isProductKey(input.productKey)) throw new QuickCaptureError("Choose a valid product.");
  if (input.personName.trim() && !input.companyName.trim() && !input.contactId) throw new QuickCaptureError("Choose an existing contact or enter a company for a new person.");
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw new QuickCaptureError("Invalid email address.");
  if (Object.values(input).some((value) => value.length > 5000)) throw new QuickCaptureError("A capture field is too long.");

  const prior = await prisma.activity.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (prior) {
    const priorTask = await prisma.task.findFirst({ where: { notes: `Quick Capture activity ${prior.id}` }, select: { id: true } });
    return { activityId: prior.id, taskId: priorTask?.id ?? null, contactId: prior.contactId, leadId: prior.leadId, accountId: prior.accountId };
  }

  const owner = await prisma.teamMember.findUnique({ where: { id: input.ownerId }, select: { active: true } });
  if (!owner?.active) throw new QuickCaptureError("Choose an active CRM owner.");
  const eventName = input.eventName.trim();
  const eventContext = Boolean(eventName);

  try {
    return await prisma.$transaction(async (tx) => {
      let contact = input.contactId ? await tx.contact.findUnique({ where: { id: input.contactId }, include: { account: true } }) : null;
      const creatingContact = !contact && Boolean(input.personName.trim());
      if (input.contactId && !contact) throw new QuickCaptureError("Selected contact no longer exists. Review the match again.", 409);
      if (contact && input.personName.trim() && normalizeName(`${contact.firstName} ${contact.lastName}`) !== normalizeName(input.personName)) {
        throw new QuickCaptureError("Selected contact conflicts with the reviewed name. Nothing was saved.", 409);
      }
      if (contact && input.companyName.trim() && normalizeName(contact.account.name) !== normalizeName(input.companyName)) {
        throw new QuickCaptureError("Selected contact has a different CRM account. Review before saving.", 409);
      }
      if (contact && input.accountId && contact.accountId !== input.accountId) {
        throw new QuickCaptureError("Selected contact and account do not match. Nothing was saved.", 409);
      }
      if (contact && input.email && contact.email && contact.email.toLowerCase() !== input.email.toLowerCase()) {
        throw new QuickCaptureError("Selected contact has a different CRM email. Nothing was overwritten.", 409);
      }
      if (contact && input.phone && contact.phone && contact.phone !== input.phone) {
        throw new QuickCaptureError("Selected contact has a different CRM phone. Nothing was overwritten.", 409);
      }

      let account = contact?.account ?? (input.accountId ? await tx.account.findUnique({ where: { id: input.accountId } }) : null);
      if (input.accountId && !account) throw new QuickCaptureError("Selected account no longer exists.", 409);
      if (account && input.companyName.trim() && normalizeName(account.name) !== normalizeName(input.companyName)) {
        throw new QuickCaptureError("Selected account conflicts with the reviewed company.", 409);
      }
      if (!account && input.companyName.trim()) {
        const candidates = await tx.account.findMany();
        account = candidates.find((candidate) => normalizeName(candidate.name) === normalizeName(input.companyName)) ?? null;
        if (!account) account = await tx.account.create({ data: { name: input.companyName.trim(), ownerId: input.ownerId } });
      }

      if (!contact && input.personName.trim()) {
        const sameEmail = input.email ? await tx.contact.findUnique({ where: { email: input.email } }) : null;
        const samePhone = input.phone ? await tx.contact.findFirst({ where: { phone: input.phone } }) : null;
        const sameName = account ? (await tx.contact.findMany({ where: { accountId: account.id } })).find((candidate) => normalizeName(`${candidate.firstName} ${candidate.lastName}`) === normalizeName(input.personName)) : null;
        if (sameEmail || samePhone || sameName) throw new QuickCaptureError("A matching contact exists. Select it on the review screen; nothing was saved.", 409);
        const [firstName, ...last] = input.personName.trim().split(/\s+/);
        contact = await tx.contact.create({ data: {
          firstName, lastName: last.join(" ") || "", accountId: account!.id,
          email: input.email.trim() || null, phone: input.phone.trim() || null,
          sourceType: eventContext ? LIVE_X_CONTEXT.sourceType : null, sourceDetail: eventName || null,
          acquisitionPath: eventContext ? LIVE_X_CONTEXT.acquisitionPath : null,
          relationshipStrength: eventContext ? "MET" : null,
        }, include: { account: true } });
      }

      let lead = null;
      if (contact && account) {
        lead = await tx.lead.findFirst({ where: { primaryContactId: contact.id, accountId: account.id, primaryProduct: input.productKey || "UNASSIGNED", convertedOpportunityId: null, status: { not: "DISQUALIFIED" } } });
        if (!lead && creatingContact) lead = await tx.lead.create({ data: {
          name: `${contact.firstName} ${contact.lastName}`.trim(), company: account.name,
          primaryProduct: input.productKey || "UNASSIGNED", status: "NEW", ownerId: input.ownerId,
          sourceType: eventContext ? LIVE_X_CONTEXT.sourceType : null, sourceDetail: eventName || null,
          accountId: account.id, primaryContactId: contact.id,
        } });
      }

      const activityNotes = [
        eventContext ? `Event: ${eventName}${input.eventDate ? ` (${input.eventDate})` : ""}` : null,
        !eventContext && input.eventDate ? `Context date: ${input.eventDate}` : null,
        input.location.trim() ? `Location: ${input.location.trim()}` : null,
        eventContext ? "Source: EVENT | Acquisition: IN_PERSON | Interaction: MET_PERSONALLY" : null,
        input.personName.trim() ? `Person: ${input.personName.trim()}` : "Person: unknown",
        input.companyName.trim() ? `Company: ${input.companyName.trim()}` : null,
        input.statedRole.trim() ? `Stated role: ${input.statedRole.trim()}` : null,
        input.conversationSummary.trim() ? `Confirmed summary: ${input.conversationSummary.trim()}` : null,
        input.relationshipContext.trim() ? `Confirmed relationship context (interpretation): ${input.relationshipContext.trim()}` : null,
        input.theirCommitment.trim() ? `Their stated commitment: ${input.theirCommitment.trim()}` : null,
        input.myCommitment.trim() ? `My commitment: ${input.myCommitment.trim()}` : null,
        input.notes.trim() ? `Notes: ${input.notes.trim()}` : null,
        `Original debrief: ${input.transcript.trim()}`,
      ].filter(Boolean).join("\n");
      const activity = await tx.activity.create({ data: {
        type: eventContext ? "EVENT_INTERACTION" : "NOTE",
        subject: eventContext ? `${eventName} — met personally` : "Quick Capture — conversation",
        notes: activityNotes, date: new Date(), product: input.productKey || null,
        ownerId: input.ownerId, accountId: account?.id ?? null, contactId: contact?.id ?? null,
        leadId: lead?.id ?? null, idempotencyKey: input.idempotencyKey,
      } });
      if (lead) await tx.lead.update({ where: { id: lead.id }, data: { lastActivityAt: activity.date } });
      const task = input.nextAction.trim() ? await tx.task.create({ data: {
        title: input.nextAction.trim(), notes: `Quick Capture activity ${activity.id}`,
        dueDate: input.dueDate ? new Date(`${input.dueDate}T12:00:00Z`) : null,
        product: input.productKey || null, ownerId: input.ownerId,
        accountId: account?.id ?? null, contactId: contact?.id ?? null, leadId: lead?.id ?? null,
      } }) : null;
      return { activityId: activity.id, taskId: task?.id ?? null, contactId: contact?.id ?? null, leadId: lead?.id ?? null, accountId: account?.id ?? null };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const replay = await prisma.activity.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (replay) return { activityId: replay.id, taskId: null, contactId: replay.contactId, leadId: replay.leadId, accountId: replay.accountId };
      throw new QuickCaptureError("A matching CRM record appeared while saving. Review and retry.", 409);
    }
    throw error;
  }
}
