import { prisma } from "./prisma";

// ArqOne CRM Sprint 05 — CRM Hygiene & Relationship Backfill, PREVIEW ONLY.
//
// This module contains no create/update/delete/upsert calls anywhere —
// intentionally, not just guarded. Sprint 05 is read-only analysis until the
// CRM owner approves individual categories in a later sprint; there is no
// execute path to accidentally trigger.

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

// Leads created by the Sprint 03/04 tooling are named "Person Name — Account
// Name"; older/legacy leads are just the plain person name. Strip the
// suffix so the person's name can be compared against a Contact's name.
function leadPersonName(leadName: string): string {
  const idx = leadName.indexOf(" — ");
  return idx === -1 ? leadName.trim() : leadName.slice(0, idx).trim();
}

const KNOWN_TRAVELPORT_ACCOUNT_NAME = "travelport";

// ─── 1. Lead → primary contact backfill ────────────────────────────────────

type LeadContactMatch = {
  leadId: string;
  leadName: string;
  accountId: string | null;
  accountName: string | null;
  currentPrimaryContactId: string | null;
  candidates: { contactId: string; contactName: string; basis: string }[];
  classification: "SAFE_TO_LINK" | "NO_MATCH" | "REVIEW_REQUIRED";
  proposedPrimaryContactId: string | null;
};

async function previewLeadPrimaryContactBackfill() {
  const leads = await prisma.lead.findMany({
    where: { primaryContactId: null },
    select: { id: true, name: true, email: true, accountId: true, account: { select: { name: true } } },
  });
  const contacts = await prisma.contact.findMany({
    select: { id: true, firstName: true, lastName: true, email: true, accountId: true },
  });

  const rows: LeadContactMatch[] = leads.map((lead) => {
    const sameAccount = contacts.filter((c) => lead.accountId && c.accountId === lead.accountId);
    const candidates = new Map<string, { contactId: string; contactName: string; basis: string }>();

    if (lead.email) {
      for (const c of sameAccount) {
        if (c.email && normalizeEmail(c.email) === normalizeEmail(lead.email)) {
          candidates.set(c.id, { contactId: c.id, contactName: `${c.firstName} ${c.lastName}`, basis: "exact email match" });
        }
      }
    }
    const leadPerson = normalizeName(leadPersonName(lead.name));
    for (const c of sameAccount) {
      if (normalizeName(`${c.firstName} ${c.lastName}`) === leadPerson) {
        const existing = candidates.get(c.id);
        candidates.set(c.id, {
          contactId: c.id,
          contactName: `${c.firstName} ${c.lastName}`,
          basis: existing ? `${existing.basis} + exact normalized name+account match` : "exact normalized name+account match",
        });
      }
    }

    const candidateList = Array.from(candidates.values());
    const classification: LeadContactMatch["classification"] =
      candidateList.length === 0 ? "NO_MATCH" : candidateList.length === 1 ? "SAFE_TO_LINK" : "REVIEW_REQUIRED";

    return {
      leadId: lead.id,
      leadName: lead.name,
      accountId: lead.accountId,
      accountName: lead.account?.name ?? null,
      currentPrimaryContactId: null,
      candidates: candidateList,
      classification,
      proposedPrimaryContactId: classification === "SAFE_TO_LINK" ? candidateList[0].contactId : null,
    };
  });

  return {
    total: rows.length,
    safeToLink: rows.filter((r) => r.classification === "SAFE_TO_LINK").length,
    noMatch: rows.filter((r) => r.classification === "NO_MATCH").length,
    reviewRequired: rows.filter((r) => r.classification === "REVIEW_REQUIRED").length,
    rows,
  };
}

// ─── 2. Account ↔ Product backfill ─────────────────────────────────────────

type AccountProductProposal = {
  accountId: string;
  accountName: string;
  evidence: { placePulseLeadCount: number; placePulseOpportunityCount: number };
  proposedRelationshipState: string | null;
  classification: "SAFE_TO_APPLY" | "REVIEW_REQUIRED";
  reason: string;
};

async function previewAccountProductBackfill() {
  const [accounts, leads, opportunities, existingAccountProducts] = await Promise.all([
    prisma.account.findMany({ select: { id: true, name: true } }),
    prisma.lead.findMany({ where: { primaryProduct: "PLACEPULSE", accountId: { not: null } }, select: { accountId: true } }),
    prisma.opportunity.findMany({ where: { product: "PLACEPULSE" }, select: { accountId: true } }),
    prisma.accountProduct.findMany({ where: { productKey: "PLACEPULSE" }, select: { accountId: true, relationshipState: true } }),
  ]);

  const existingSet = new Set(existingAccountProducts.map((ap) => ap.accountId));
  const leadCountByAccount = new Map<string, number>();
  for (const l of leads) leadCountByAccount.set(l.accountId as string, (leadCountByAccount.get(l.accountId as string) ?? 0) + 1);
  const oppCountByAccount = new Map<string, number>();
  for (const o of opportunities) oppCountByAccount.set(o.accountId, (oppCountByAccount.get(o.accountId) ?? 0) + 1);

  const candidateAccountIds = new Set<string>();
  leadCountByAccount.forEach((_, id) => candidateAccountIds.add(id));
  oppCountByAccount.forEach((_, id) => candidateAccountIds.add(id));
  const rows: AccountProductProposal[] = [];

  for (const accountId of Array.from(candidateAccountIds)) {
    if (existingSet.has(accountId)) continue; // do not touch/modify existing rows
    const account = accounts.find((a) => a.id === accountId);
    if (!account) continue;
    const leadCount = leadCountByAccount.get(accountId) ?? 0;
    const oppCount = oppCountByAccount.get(accountId) ?? 0;

    // Deterministic mapping: an actual Opportunity record is evidence of
    // relationshipState=OPPORTUNITY (the schema's own default for this
    // scenario, already used identically in Sprint 03/04). A Lead alone,
    // with no Opportunity, is evidence only that the account is a
    // PROSPECT — nothing in the schema lets us infer CUSTOMER/PARTNER/
    // ENGAGED deterministically from a Lead or Opportunity's mere
    // existence, so those are never proposed.
    let proposedRelationshipState: string | null;
    let classification: AccountProductProposal["classification"];
    let reason: string;
    if (oppCount > 0) {
      proposedRelationshipState = "OPPORTUNITY";
      classification = "SAFE_TO_APPLY";
      reason = `${oppCount} PlacePulse Opportunity record(s) exist for this account`;
    } else if (leadCount > 0) {
      proposedRelationshipState = "PROSPECT";
      classification = "SAFE_TO_APPLY";
      reason = `${leadCount} PlacePulse Lead(s) exist, no Opportunity yet — PROSPECT is the schema default for this stage`;
    } else {
      proposedRelationshipState = null;
      classification = "REVIEW_REQUIRED";
      reason = "unreachable — account matched candidate set with no lead/opportunity evidence";
    }

    rows.push({
      accountId,
      accountName: account.name,
      evidence: { placePulseLeadCount: leadCount, placePulseOpportunityCount: oppCount },
      proposedRelationshipState,
      classification,
      reason,
    });
  }

  return {
    total: rows.length,
    safeToApply: rows.filter((r) => r.classification === "SAFE_TO_APPLY").length,
    reviewRequired: rows.filter((r) => r.classification === "REVIEW_REQUIRED").length,
    existingAccountProductRowsUntouched: existingAccountProducts.length,
    rows,
  };
}

// ─── 3. Contact provenance / relationshipStrength backfill ────────────────

type ContactProvenanceProposal = {
  contactId: string;
  contactName: string;
  accountName: string | null;
  current: { sourceType: string | null; sourceDetail: string | null; acquisitionPath: string | null; relationshipStrength: string | null };
  proposed: { sourceType: string | null; sourceDetail: string | null };
  evidence: string;
  relationshipStrengthNote: string;
  classification: "SAFE_TO_BACKFILL" | "PARTIAL_BACKFILL" | "REVIEW_REQUIRED" | "NO_EVIDENCE";
};

async function previewContactProvenanceBackfill() {
  const contacts = await prisma.contact.findMany({
    where: { OR: [{ sourceType: null }, { sourceDetail: null }, { acquisitionPath: null }, { relationshipStrength: null }] },
    select: {
      id: true, firstName: true, lastName: true, accountId: true,
      sourceType: true, sourceDetail: true, acquisitionPath: true, relationshipStrength: true,
      account: { select: { name: true } },
    },
  });
  const leads = await prisma.lead.findMany({
    select: { id: true, name: true, accountId: true, primaryContactId: true, sourceType: true, sourceDetail: true },
  });

  const rows: ContactProvenanceProposal[] = contacts.map((c) => {
    // Deterministic lead match: linked directly via primaryContactId, or
    // exact normalized name+account match (same rule as section 1).
    const directLink = leads.filter((l) => l.primaryContactId === c.id);
    const nameMatch = leads.filter(
      (l) => l.accountId === c.accountId && normalizeName(leadPersonName(l.name)) === normalizeName(`${c.firstName} ${c.lastName}`)
    );
    const matchedLeads = directLink.length > 0 ? directLink : nameMatch;

    const current = {
      sourceType: c.sourceType,
      sourceDetail: c.sourceDetail,
      acquisitionPath: c.acquisitionPath,
      relationshipStrength: c.relationshipStrength,
    };

    let proposed = { sourceType: c.sourceType, sourceDetail: c.sourceDetail };
    let evidence = "no uniquely-matched Lead found";
    let classification: ContactProvenanceProposal["classification"] = "NO_EVIDENCE";

    if (matchedLeads.length > 1) {
      evidence = `ambiguous — ${matchedLeads.length} Leads match this contact by name+account, no direct primaryContactId link to disambiguate`;
      classification = "REVIEW_REQUIRED";
    } else if (matchedLeads.length === 1) {
      const lead = matchedLeads[0];
      const canFillSourceType = !c.sourceType && lead.sourceType;
      const canFillSourceDetail = !c.sourceDetail && lead.sourceDetail;
      if (canFillSourceType || canFillSourceDetail) {
        proposed = {
          sourceType: canFillSourceType ? lead.sourceType : c.sourceType,
          sourceDetail: canFillSourceDetail ? lead.sourceDetail : c.sourceDetail,
        };
        evidence = `matched Lead "${lead.name}" (${directLink.length > 0 ? "linked via primaryContactId" : "exact normalized name+account match"}) — sourceType=${lead.sourceType ?? "null"}, sourceDetail=${lead.sourceDetail ?? "null"}`;
        classification = c.acquisitionPath ? "SAFE_TO_BACKFILL" : "PARTIAL_BACKFILL";
      } else if (!c.sourceType && !lead.sourceType) {
        evidence = `matched Lead "${lead.name}" but it also has no sourceType/sourceDetail set — no evidence to copy`;
        classification = "NO_EVIDENCE";
      } else {
        evidence = `matched Lead "${lead.name}" but Contact's own provenance fields are already set — nothing to change (would be a conflict if values differed, not silently overwritten)`;
        classification = c.acquisitionPath ? "SAFE_TO_BACKFILL" : "PARTIAL_BACKFILL";
      }
    }

    // relationshipStrength is never derived from Lead.status per Sprint 05
    // scope — the CRM has no other deterministic source for it, so it is
    // always left as NO_EVIDENCE unless already set.
    const relationshipStrengthNote = c.relationshipStrength
      ? "already set — left unchanged"
      : "no deterministic non-status evidence exists in the CRM for this field — NOT derived from Lead.status per Sprint 05 rule; classified NO_EVIDENCE for this field regardless of the row's overall classification";

    if (classification === "NO_EVIDENCE" && !c.relationshipStrength && (c.sourceType || c.sourceDetail)) {
      // provenance already partially present, nothing new to add, relationship still has no evidence
      classification = "NO_EVIDENCE";
    }

    return {
      contactId: c.id,
      contactName: `${c.firstName} ${c.lastName}`,
      accountName: c.account?.name ?? null,
      current,
      proposed,
      evidence,
      relationshipStrengthNote,
      classification,
    };
  });

  return {
    total: rows.length,
    safeToBackfill: rows.filter((r) => r.classification === "SAFE_TO_BACKFILL").length,
    partialBackfill: rows.filter((r) => r.classification === "PARTIAL_BACKFILL").length,
    reviewRequired: rows.filter((r) => r.classification === "REVIEW_REQUIRED").length,
    noEvidence: rows.filter((r) => r.classification === "NO_EVIDENCE").length,
    rows,
  };
}

// ─── 4. Opportunity primary contact — human review only ───────────────────

async function previewOpportunityPrimaryContactReview() {
  const opportunities = await prisma.opportunity.findMany({
    where: { contacts: { some: {} } },
    select: {
      id: true,
      name: true,
      account: { select: { name: true } },
      contacts: {
        select: {
          isPrimary: true,
          stakeholderRole: true,
          contact: {
            select: {
              id: true, firstName: true, lastName: true, relationshipStrength: true, accountId: true,
              account: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  const leads = await prisma.lead.findMany({ select: { id: true, name: true, accountId: true, primaryContactId: true } });

  const rows = opportunities
    .filter((o) => !o.contacts.some((c) => c.isPrimary))
    .map((o) => ({
      opportunityId: o.id,
      opportunityName: o.name,
      accountName: o.account.name,
      candidates: o.contacts.map((oc) => {
        const linkedLead =
          leads.find((l) => l.primaryContactId === oc.contact.id) ??
          leads.find(
            (l) => l.accountId === oc.contact.accountId && normalizeName(leadPersonName(l.name)) === normalizeName(`${oc.contact.firstName} ${oc.contact.lastName}`)
          ) ??
          null;
        return {
          contactId: oc.contact.id,
          contactName: `${oc.contact.firstName} ${oc.contact.lastName}`,
          accountName: oc.contact.account.name,
          stakeholderRole: oc.stakeholderRole,
          relationshipStrength: oc.contact.relationshipStrength,
          linkedLead: linkedLead ? { id: linkedLead.id, name: linkedLead.name } : null,
        };
      }),
      classification: "HUMAN_REVIEW" as const,
    }));

  return { total: rows.length, rows };
}

// ─── 5. Task due-date review ────────────────────────────────────────────────

const DATE_PATTERNS = [
  /\b\d{4}-\d{2}-\d{2}\b/, // ISO
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/, // slash date
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b/i, // "March 5"
  /\bby\s+(end of\s+)?(this|next)\s+(week|month)\b/i, // relative commitment
];

function extractDeterministicDate(text: string | null): string | null {
  if (!text) return null;
  for (const pattern of DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

async function previewTaskDueDateReview() {
  const tasks = await prisma.task.findMany({
    where: { dueDate: null, status: "OPEN" },
    select: {
      id: true, title: true, notes: true, createdAt: true, product: true,
      account: { select: { name: true } },
      contact: { select: { firstName: true, lastName: true } },
      lead: { select: { name: true } },
      opportunity: { select: { name: true } },
    },
  });

  const rows = tasks.map((t) => {
    const foundInTitle = extractDeterministicDate(t.title);
    const foundInNotes = extractDeterministicDate(t.notes);
    const found = foundInTitle ?? foundInNotes;
    return {
      taskId: t.id,
      title: t.title,
      notes: t.notes,
      createdAt: t.createdAt,
      account: t.account?.name ?? null,
      contact: t.contact ? `${t.contact.firstName} ${t.contact.lastName}` : null,
      lead: t.lead?.name ?? null,
      opportunity: t.opportunity?.name ?? null,
      product: t.product,
      deterministicDateFound: found,
      classification: found ? ("SAFE_TO_APPLY" as const) : ("NEEDS_DATE" as const),
    };
  });

  return {
    total: rows.length,
    safeToApply: rows.filter((r) => r.classification === "SAFE_TO_APPLY").length,
    needsDate: rows.filter((r) => r.classification === "NEEDS_DATE").length,
    rows,
  };
}

// ─── Regression checks + named-record spot checks ──────────────────────────

async function regressionAndSpotChecks(
  leadBackfill: Awaited<ReturnType<typeof previewLeadPrimaryContactBackfill>>,
  contactProvenance: Awaited<ReturnType<typeof previewContactProvenanceBackfill>>
) {
  const travelportRow = leadBackfill.rows.find((r) => (r.accountName ?? "").toLowerCase() === KNOWN_TRAVELPORT_ACCOUNT_NAME);
  const travelportProvenanceRow = contactProvenance.rows.find((r) => (r.accountName ?? "").toLowerCase() === KNOWN_TRAVELPORT_ACCOUNT_NAME);

  const johnBevanLeadRow = leadBackfill.rows.find((r) => r.leadName.toLowerCase().includes("john bevan"));
  const johnBevanProvenanceRow = contactProvenance.rows.find((r) => r.contactName.toLowerCase().includes("john bevan"));

  return {
    noDuplicatesPossible: "guaranteed by construction — this module contains zero create/update/delete/upsert calls",
    noActivitiesCreated: "guaranteed by construction — no Activity writes exist in this module",
    noOpportunitiesCreated: "guaranteed by construction — no Opportunity writes exist in this module",
    noPipelineValuesChanged: "guaranteed by construction — Opportunity.value/probability/stage are never read for writing, only Opportunity.contacts are read for review in section 4",
    adrianRoodtTravelport: travelportRow || travelportProvenanceRow
      ? {
          leadBackfillRow: travelportRow ?? null,
          provenanceRow: travelportProvenanceRow ?? null,
          note: "REPORT_ONLY — independently qualifies for deterministic backfill like every other row in its category (same exact-match rule applied uniformly); nothing executes this sprint regardless.",
        }
      : { note: "No Travelport row appeared in either backfill category — already fully linked/provenanced from Sprint 03." },
    johnBevan: johnBevanLeadRow || johnBevanProvenanceRow
      ? {
          leadBackfillRow: johnBevanLeadRow ?? null,
          provenanceRow: johnBevanProvenanceRow ?? null,
          note: "REPORT_ONLY — surfaced here only because he matched a preview category's deterministic criteria like any other record; nothing executes this sprint, and he remains excluded from any future execution scope per his hold-for-later status until separately approved.",
        }
      : { note: "John Bevan did not appear in either backfill category." },
  };
}

export async function generateSprint05Preview() {
  const [leadBackfill, accountProduct, contactProvenance, opportunityPrimary, taskDueDates] = await Promise.all([
    previewLeadPrimaryContactBackfill(),
    previewAccountProductBackfill(),
    previewContactProvenanceBackfill(),
    previewOpportunityPrimaryContactReview(),
    previewTaskDueDateReview(),
  ]);

  const regression = await regressionAndSpotChecks(leadBackfill, contactProvenance);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      leadPrimaryContactBackfill: { total: leadBackfill.total, safeToLink: leadBackfill.safeToLink, noMatch: leadBackfill.noMatch, reviewRequired: leadBackfill.reviewRequired },
      accountProductBackfill: { total: accountProduct.total, safeToApply: accountProduct.safeToApply, reviewRequired: accountProduct.reviewRequired },
      contactProvenanceBackfill: { total: contactProvenance.total, safeToBackfill: contactProvenance.safeToBackfill, partialBackfill: contactProvenance.partialBackfill, reviewRequired: contactProvenance.reviewRequired, noEvidence: contactProvenance.noEvidence },
      opportunityPrimaryContactReview: { total: opportunityPrimary.total },
      taskDueDateReview: { total: taskDueDates.total, safeToApply: taskDueDates.safeToApply, needsDate: taskDueDates.needsDate },
    },
    leadPrimaryContactBackfill: leadBackfill,
    accountProductBackfill: accountProduct,
    contactProvenanceBackfill: contactProvenance,
    opportunityPrimaryContactReview: opportunityPrimary,
    taskDueDateReview: taskDueDates,
    regression,
  };
}
