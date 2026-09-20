/**
 * Quick Capture — event-capture MVP core logic (Sprint 06E).
 *
 * A narrow capture tool, not a qualification engine: it records exactly
 * what was entered, links it deterministically, and infers nothing —
 * no relationship strength, no buying intent, no commercial value, no
 * qualification. See src/app/api/capture/event/route.ts for the thin
 * HTTP adapter over this module.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeName } from "@/lib/normalize";
import { isProductKey, type ProductKey } from "@/lib/products";

// "Referral" (generic) and "Stand referral" are distinct capture-time
// concepts that both exist in the schema's ACQUISITION_PATHS enum
// (INTERNAL_REFERRAL vs STAND_REFERRAL) — reused as-is. "Other" has no
// equivalent value in that enum (the closest, COLD_TARGET, means
// something semantically different — a cold outreach target, not "some
// other acquisition path") so it intentionally maps to null rather than
// forcing a wrong value or inventing a new enum member.
export const CAPTURE_ACQUISITION_OPTIONS = [
  { key: "MET_PERSONALLY", label: "Met personally", acquisitionPath: "DIRECT_MEETING" },
  { key: "INTRODUCTION", label: "Introduction", acquisitionPath: "INTRODUCTION" },
  { key: "REFERRAL", label: "Referral", acquisitionPath: "INTERNAL_REFERRAL" },
  { key: "STAND_REFERRAL", label: "Stand referral", acquisitionPath: "STAND_REFERRAL" },
  { key: "CARD_ONLY", label: "Card only", acquisitionPath: "CARD_PROVIDED" },
  { key: "OTHER", label: "Other", acquisitionPath: null },
] as const;
export type CaptureAcquisitionKey = (typeof CAPTURE_ACQUISITION_OPTIONS)[number]["key"];

export function isCaptureAcquisitionKey(v: unknown): v is CaptureAcquisitionKey {
  return typeof v === "string" && CAPTURE_ACQUISITION_OPTIONS.some((o) => o.key === v);
}

function acquisitionPathFor(key: CaptureAcquisitionKey): string | null {
  return CAPTURE_ACQUISITION_OPTIONS.find((o) => o.key === key)?.acquisitionPath ?? null;
}

export type CaptureClassification =
  | "NEW_ACCOUNT_NEW_CONTACT"
  | "EXISTING_ACCOUNT_NEW_CONTACT"
  | "EXISTING_CONTACT"
  | "REVIEW_REQUIRED";

export type CaptureEventInput = {
  eventName: string;
  fullName: string;
  company: string;
  jobTitle?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin?: string | null;
  product: string;
  acquisitionKey?: CaptureAcquisitionKey | null;
  note?: string | null;
  nextAction?: string | null;
  dueDate?: string | null; // ISO date, internal follow-up target only
  idempotencyKey: string;
  /** Set true only on a resubmit after the caller has seen a REVIEW_REQUIRED
   * response and explicitly chosen to proceed as a separate contact. */
  confirmReviewRequired?: boolean;
};

export type CaptureEventResult =
  | {
      ok: true;
      classification: Exclude<CaptureClassification, "REVIEW_REQUIRED">;
      accountId: string;
      contactId: string;
      leadId: string;
      activityId: string;
      taskId: string | null;
    }
  | { ok: false; status: 400; error: string }
  | {
      ok: false;
      status: 409;
      classification: "REVIEW_REQUIRED";
      conflict: { existingContactId: string; existingContactName: string; existingAccountName: string | null };
    };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(input: CaptureEventInput): string | null {
  if (!input.eventName?.trim()) return "eventName is required.";
  if (!input.fullName?.trim()) return "fullName is required.";
  if (!input.company?.trim()) return "company is required.";
  if (!input.idempotencyKey) return "idempotencyKey is required.";
  if (!isProductKey(input.product)) return "A valid product is required.";
  if (input.email && !EMAIL_RE.test(input.email)) return "email must be a valid address.";
  if (input.acquisitionKey && !isCaptureAcquisitionKey(input.acquisitionKey)) return "Unsupported acquisitionKey.";
  return null;
}

export async function captureEvent(input: CaptureEventInput): Promise<CaptureEventResult> {
  const validationError = validate(input);
  if (validationError) return { ok: false, status: 400, error: validationError };

  // Idempotent replay: this exact submission already produced an Activity —
  // return the same linked records rather than creating a second set.
  const existingActivity = await prisma.activity.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existingActivity && existingActivity.contactId && existingActivity.accountId && existingActivity.leadId) {
    return {
      ok: true,
      classification: "EXISTING_CONTACT",
      accountId: existingActivity.accountId,
      contactId: existingActivity.contactId,
      leadId: existingActivity.leadId,
      activityId: existingActivity.id,
      taskId: null,
    };
  }

  const product = input.product as ProductKey;
  const normalizedCompany = normalizeName(input.company);
  const normalizedFullName = normalizeName(input.fullName);
  const acquisitionPath = input.acquisitionKey ? acquisitionPathFor(input.acquisitionKey) : null;

  // Email match is checked outside the transaction so a REVIEW_REQUIRED
  // conflict can be reported without opening a write transaction at all.
  if (input.email && !input.confirmReviewRequired) {
    const byEmail = await prisma.contact.findUnique({ where: { email: input.email }, include: { account: true } });
    if (byEmail) {
      const sameName = normalizeName(`${byEmail.firstName} ${byEmail.lastName}`) === normalizedFullName;
      const sameAccount = byEmail.account && normalizeName(byEmail.account.name) === normalizedCompany;
      if (!sameName || !sameAccount) {
        return {
          ok: false,
          status: 409,
          classification: "REVIEW_REQUIRED",
          conflict: { existingContactId: byEmail.id, existingContactName: `${byEmail.firstName} ${byEmail.lastName}`, existingAccountName: byEmail.account?.name ?? null },
        };
      }
    }
  }

  return prisma.$transaction(async (tx) => {
    // 1. Account — deterministic exact-normalized-name match only.
    const accounts = await tx.account.findMany({ select: { id: true, name: true } });
    const matchedAccount = accounts.find((a) => normalizeName(a.name) === normalizedCompany);
    const account = matchedAccount ?? (await tx.account.create({ data: { name: input.company.trim() } }));
    const accountIsNew = !matchedAccount;

    // 2. Contact — exact email first (skipped here if it already resolved to
    // a same-name/same-account match above, or if confirmReviewRequired is
    // creating a deliberately separate record), then exact normalized name
    // within this Account.
    let contact = input.email && !input.confirmReviewRequired
      ? await tx.contact.findUnique({ where: { email: input.email } })
      : null;
    if (!contact) {
      const accountContacts = await tx.contact.findMany({ where: { accountId: account.id } });
      contact = accountContacts.find((c) => normalizeName(`${c.firstName} ${c.lastName}`) === normalizedFullName) ?? null;
    }

    let classification: Exclude<CaptureClassification, "REVIEW_REQUIRED">;
    if (contact) {
      // Enrich only genuinely missing fields — never overwrite non-null data.
      const enrichment: Prisma.ContactUpdateInput = {};
      if (!contact.email && input.email) enrichment.email = input.email;
      if (!contact.phone && input.phone) enrichment.phone = input.phone;
      if (!contact.title && input.jobTitle) enrichment.title = input.jobTitle;
      if (!contact.linkedin && input.linkedin) enrichment.linkedin = input.linkedin;
      if (!contact.sourceType) enrichment.sourceType = "EVENT";
      if (!contact.sourceDetail) enrichment.sourceDetail = input.eventName.trim();
      if (!contact.acquisitionPath && acquisitionPath) enrichment.acquisitionPath = acquisitionPath;
      if (Object.keys(enrichment).length > 0) {
        contact = await tx.contact.update({ where: { id: contact.id }, data: enrichment });
      }
      classification = "EXISTING_CONTACT";
    } else {
      const [firstName, ...rest] = input.fullName.trim().split(/\s+/);
      contact = await tx.contact.create({
        data: {
          firstName,
          lastName: rest.join(" ") || firstName,
          email: input.email || null,
          phone: input.phone || null,
          title: input.jobTitle || null,
          linkedin: input.linkedin || null,
          accountId: account.id,
          sourceType: "EVENT",
          sourceDetail: input.eventName.trim(),
          acquisitionPath,
        },
      });
      classification = accountIsNew ? "NEW_ACCOUNT_NEW_CONTACT" : "EXISTING_ACCOUNT_NEW_CONTACT";
    }

    // 3. Lead — reuse an active Lead for this exact Contact/Account/product
    // combination; never mark it as anything beyond NEW automatically.
    let lead = await tx.lead.findFirst({
      where: { accountId: account.id, primaryContactId: contact.id, primaryProduct: product, status: { not: "DISQUALIFIED" }, convertedOpportunityId: null },
    });
    if (!lead) {
      lead = await tx.lead.create({
        data: {
          name: input.fullName.trim(),
          company: input.company.trim(),
          title: input.jobTitle || null,
          email: input.email || null,
          phone: input.phone || null,
          primaryProduct: product,
          status: "NEW",
          sourceType: "EVENT",
          sourceDetail: input.eventName.trim(),
          accountId: account.id,
          primaryContactId: contact.id,
        },
      });
    }

    // 4. Activity — always created on a successful capture.
    const activity = await tx.activity.create({
      data: {
        type: "EVENT_INTERACTION",
        subject: `${input.eventName.trim()} — initial conversation`,
        notes: input.note?.trim() || null,
        date: new Date(),
        product,
        accountId: account.id,
        contactId: contact.id,
        leadId: lead.id,
        idempotencyKey: input.idempotencyKey,
      },
    });
    await tx.lead.update({ where: { id: lead.id }, data: { lastActivityAt: activity.date } });

    // 5. Task — only if a next action was actually entered. dueDate is
    // always an internal target; clientCommitmentDate is never set here.
    let task = null;
    if (input.nextAction?.trim()) {
      task = await tx.task.create({
        data: {
          title: input.nextAction.trim(),
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          product,
          accountId: account.id,
          contactId: contact.id,
          leadId: lead.id,
        },
      });
    }

    return {
      ok: true,
      classification,
      accountId: account.id,
      contactId: contact.id,
      leadId: lead.id,
      activityId: activity.id,
      taskId: task?.id ?? null,
    };
  });
}
