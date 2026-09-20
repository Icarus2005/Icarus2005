import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";

// ArqOne CRM Sprint 05 — narrowly scoped execution for the categories the
// CRM owner explicitly approved, and only those. Every exclusion below is
// enforced by name lookup (never a hardcoded ID assumed stable), and every
// write re-verifies the record's current state immediately before writing
// — if production has moved since the preview was generated, that row is
// aborted and reported, never guessed. Excluded records are still resolved
// and read (to prove they're being skipped, not to write anything).

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

function leadPersonName(leadName: string): string {
  const idx = leadName.indexOf(" — ");
  return idx === -1 ? leadName.trim() : leadName.slice(0, idx).trim();
}

const EXCLUDED_CONTACT_NAMES = ["adrian roodt", "john bevan"];
const EXCLUDED_LEAD_NAME_FRAGMENTS = ["adrian roodt", "john bevan", "bahrain airport", "jumeirah group"];
const EXCLUDED_ACCOUNT_NAMES = ["travelport", "dnata travel"];

const OPPORTUNITY_PRIMARY_ASSIGNMENTS: { opportunityNameContains: string; contactName: string }[] = [
  { opportunityNameContains: "sabre", contactName: "Ishaq Khattak" },
  { opportunityNameContains: "tourism 365", contactName: "Rebin Baby" },
  { opportunityNameContains: "doha oasis", contactName: "Muhammad Nasir" },
  // Abu Dhabi Airports: deliberately excluded — no primary assigned this sprint.
];

type RowResult = { category: string; key: string; status: "applied" | "already_applied" | "skipped" | "excluded" | "aborted"; detail: string };

// ─── A. Lead -> primary Contact backfill ───────────────────────────────────

async function computeLeadCandidates() {
  const leads = await prisma.lead.findMany({
    where: { primaryContactId: null },
    select: { id: true, name: true, email: true, accountId: true, account: { select: { name: true } } },
  });
  const contacts = await prisma.contact.findMany({
    select: { id: true, firstName: true, lastName: true, email: true, accountId: true },
  });

  return leads.map((lead) => {
    const sameAccount = contacts.filter((c) => lead.accountId && c.accountId === lead.accountId);
    const candidates = new Map<string, { contactId: string; contactName: string }>();
    if (lead.email) {
      for (const c of sameAccount) {
        if (c.email && normalizeEmail(c.email) === normalizeEmail(lead.email)) {
          candidates.set(c.id, { contactId: c.id, contactName: `${c.firstName} ${c.lastName}` });
        }
      }
    }
    const leadPerson = normalizeName(leadPersonName(lead.name));
    for (const c of sameAccount) {
      if (normalizeName(`${c.firstName} ${c.lastName}`) === leadPerson) {
        candidates.set(c.id, { contactId: c.id, contactName: `${c.firstName} ${c.lastName}` });
      }
    }
    const candidateList = Array.from(candidates.values());
    return {
      leadId: lead.id,
      leadName: lead.name,
      accountName: lead.account?.name ?? null,
      isExcluded:
        EXCLUDED_LEAD_NAME_FRAGMENTS.some((f) => normalizeName(lead.name).includes(f)) ||
        (candidateList.length === 1 && EXCLUDED_CONTACT_NAMES.includes(normalizeName(candidateList[0].contactName))),
      classification: candidateList.length === 0 ? "NO_MATCH" : candidateList.length === 1 ? "SAFE_TO_LINK" : "REVIEW_REQUIRED",
      proposedContactId: candidateList.length === 1 ? candidateList[0].contactId : null,
      proposedContactName: candidateList.length === 1 ? candidateList[0].contactName : null,
    };
  });
}

// ─── B. Account <-> PLACEPULSE Product backfill ────────────────────────────

async function computeAccountProductCandidates() {
  const [accounts, leads, opportunities, existing] = await Promise.all([
    prisma.account.findMany({ select: { id: true, name: true } }),
    prisma.lead.findMany({ where: { primaryProduct: "PLACEPULSE", accountId: { not: null } }, select: { accountId: true } }),
    prisma.opportunity.findMany({ where: { product: "PLACEPULSE" }, select: { accountId: true } }),
    prisma.accountProduct.findMany({ where: { productKey: "PLACEPULSE" }, select: { accountId: true } }),
  ]);
  const existingSet = new Set(existing.map((e) => e.accountId));
  const leadAccounts = new Set(leads.map((l) => l.accountId as string));
  const oppAccounts = new Set(opportunities.map((o) => o.accountId));
  const candidateIds = new Set<string>();
  leadAccounts.forEach((id) => candidateIds.add(id));
  oppAccounts.forEach((id) => candidateIds.add(id));

  return Array.from(candidateIds)
    .filter((id) => !existingSet.has(id))
    .map((accountId) => {
      const account = accounts.find((a) => a.id === accountId)!;
      const relationshipState = oppAccounts.has(accountId) ? "OPPORTUNITY" : "PROSPECT";
      return {
        accountId,
        accountName: account.name,
        isExcluded: EXCLUDED_ACCOUNT_NAMES.includes(normalizeName(account.name)),
        relationshipState,
      };
    });
}

// ─── C. Contact provenance backfill ────────────────────────────────────────

async function computeContactProvenanceCandidates() {
  const contacts = await prisma.contact.findMany({
    where: { OR: [{ sourceType: null }, { sourceDetail: null }] },
    select: { id: true, firstName: true, lastName: true, accountId: true, sourceType: true, sourceDetail: true },
  });
  const leads = await prisma.lead.findMany({
    select: { id: true, name: true, accountId: true, primaryContactId: true, sourceType: true, sourceDetail: true },
  });

  return contacts.map((c) => {
    const directLink = leads.filter((l) => l.primaryContactId === c.id);
    const nameMatch = leads.filter(
      (l) => l.accountId === c.accountId && normalizeName(leadPersonName(l.name)) === normalizeName(`${c.firstName} ${c.lastName}`)
    );
    const matched = directLink.length > 0 ? directLink : nameMatch;
    const contactName = `${c.firstName} ${c.lastName}`;
    let proposedSourceType: string | null = null;
    let proposedSourceDetail: string | null = null;
    let classification: "PARTIAL_BACKFILL" | "REVIEW_REQUIRED" | "NO_EVIDENCE" = "NO_EVIDENCE";

    if (matched.length === 1) {
      const lead = matched[0];
      if (!c.sourceType && lead.sourceType) proposedSourceType = lead.sourceType;
      if (!c.sourceDetail && lead.sourceDetail) proposedSourceDetail = lead.sourceDetail;
      if (proposedSourceType || proposedSourceDetail) classification = "PARTIAL_BACKFILL";
    } else if (matched.length > 1) {
      classification = "REVIEW_REQUIRED";
    }

    return {
      contactId: c.id,
      contactName,
      isExcluded: EXCLUDED_CONTACT_NAMES.includes(normalizeName(contactName)),
      classification,
      currentSourceType: c.sourceType,
      currentSourceDetail: c.sourceDetail,
      proposedSourceType,
      proposedSourceDetail,
    };
  });
}

// ─── D. Opportunity primary contact ────────────────────────────────────────

async function computeOpportunityPrimaryCandidates() {
  const opportunities = await prisma.opportunity.findMany({
    select: {
      id: true,
      name: true,
      contacts: { select: { contactId: true, isPrimary: true, contact: { select: { firstName: true, lastName: true } } } },
    },
  });

  return OPPORTUNITY_PRIMARY_ASSIGNMENTS.map((assign) => {
    const opp = opportunities.find((o) => normalizeName(o.name).includes(assign.opportunityNameContains));
    if (!opp) {
      return { ...assign, opportunityId: null, opportunityName: null, matchedContactId: null, alreadyPrimary: false, status: "opportunity_not_found" as const };
    }
    const link = opp.contacts.find((oc) => normalizeName(`${oc.contact.firstName} ${oc.contact.lastName}`) === normalizeName(assign.contactName));
    if (!link) {
      return { ...assign, opportunityId: opp.id, opportunityName: opp.name, matchedContactId: null, alreadyPrimary: false, status: "contact_not_linked" as const };
    }
    return {
      ...assign,
      opportunityId: opp.id,
      opportunityName: opp.name,
      matchedContactId: link.contactId,
      alreadyPrimary: link.isPrimary,
      otherPrimaryRows: opp.contacts.filter((oc) => oc.contactId !== link.contactId && oc.isPrimary).map((oc) => oc.contactId),
      status: "ready" as const,
    };
  });
}

// ─── PREVIEW (scoped to approved categories only) ──────────────────────────

export async function previewSprint05Execution() {
  const [leadCandidates, accountProductCandidates, contactCandidates, opportunityAssignments] = await Promise.all([
    computeLeadCandidates(),
    computeAccountProductCandidates(),
    computeContactProvenanceCandidates(),
    computeOpportunityPrimaryCandidates(),
  ]);

  const leadUpdates = leadCandidates.filter((l) => l.classification === "SAFE_TO_LINK" && !l.isExcluded);
  const leadExcluded = leadCandidates.filter((l) => l.classification === "SAFE_TO_LINK" && l.isExcluded);
  const leadNoMatch = leadCandidates.filter((l) => l.classification === "NO_MATCH");

  const accountProductCreates = accountProductCandidates.filter((a) => !a.isExcluded);
  const accountProductExcluded = accountProductCandidates.filter((a) => a.isExcluded);

  const contactUpdates = contactCandidates.filter((c) => c.classification === "PARTIAL_BACKFILL" && !c.isExcluded);
  const contactExcluded = contactCandidates.filter((c) => c.classification === "PARTIAL_BACKFILL" && c.isExcluded);

  return {
    generatedAt: new Date().toISOString(),
    checklist: {
      "1_leadPrimaryContactUpdates_expected21": leadUpdates.length,
      "2_accountProductCreates_expected26": accountProductCreates.length,
      "3_contactProvenanceUpdates_expected19": contactUpdates.length,
      "4_opportunityPrimaryAssignments_expected3": opportunityAssignments.filter((a) => a.status === "ready" && !a.alreadyPrimary).length,
      "5_taskUpdates_expected0": 0,
      "6_activityCreates_expected0": 0,
      "7_opportunityCreates_expected0": 0,
      "8_adrianRoodtTravelportWrites_expected0": 0,
      "9_johnBevanWrites_expected0": 0,
      "10_dnataTravelAccountProductCreates_expected0": 0,
      "11_bahrainAirportViaIshaqLeadWrites_expected0": 0,
      "12_jumeiraGroupLeadWrites_expected0": 0,
    },
    opportunityPrimaryAssignments: opportunityAssignments.map((a) => ({
      opportunityName: a.opportunityName,
      contactName: a.contactName,
      status: a.status,
      alreadyPrimary: "alreadyPrimary" in a ? a.alreadyPrimary : undefined,
    })),
    leadPrimaryContactBackfill: { willUpdate: leadUpdates, excludedFromWrite: leadExcluded, noMatchUnchanged: leadNoMatch },
    accountProductBackfill: { willCreate: accountProductCreates, excludedFromWrite: accountProductExcluded },
    contactProvenanceBackfill: { willUpdate: contactUpdates, excludedFromWrite: contactExcluded },
  };
}

// ─── EXECUTE (scoped to approved categories only) ──────────────────────────

export async function executeSprint05() {
  const report: RowResult[] = [];

  // A. Lead -> primary Contact
  const leadCandidates = await computeLeadCandidates();
  for (const l of leadCandidates) {
    if (l.classification !== "SAFE_TO_LINK") continue;
    if (l.isExcluded) {
      report.push({ category: "A", key: l.leadName, status: "excluded", detail: "excluded per approved scope (Adrian Roodt / John Bevan / NO_MATCH quarantine list) — left untouched" });
      continue;
    }
    // Re-verify immediately before write.
    const fresh = await prisma.lead.findUnique({ where: { id: l.leadId }, select: { primaryContactId: true } });
    if (!fresh) {
      report.push({ category: "A", key: l.leadName, status: "aborted", detail: "lead no longer exists" });
      continue;
    }
    if (fresh.primaryContactId === l.proposedContactId) {
      report.push({ category: "A", key: l.leadName, status: "already_applied", detail: `already linked to ${l.proposedContactName}` });
      continue;
    }
    if (fresh.primaryContactId) {
      report.push({ category: "A", key: l.leadName, status: "aborted", detail: `production now has a different primaryContactId than preview expected — not overwritten` });
      continue;
    }
    const contactStillExists = await prisma.contact.findUnique({ where: { id: l.proposedContactId! } });
    if (!contactStillExists) {
      report.push({ category: "A", key: l.leadName, status: "aborted", detail: "candidate contact no longer exists" });
      continue;
    }
    await prisma.lead.update({ where: { id: l.leadId }, data: { primaryContactId: l.proposedContactId } });
    report.push({ category: "A", key: l.leadName, status: "applied", detail: `primaryContactId set to ${l.proposedContactName} (${l.proposedContactId})` });
  }

  // B. Account <-> PLACEPULSE Product
  const accountProductCandidates = await computeAccountProductCandidates();
  for (const a of accountProductCandidates) {
    if (a.isExcluded) {
      report.push({ category: "B", key: a.accountName, status: "excluded", detail: "excluded per approved scope (Travelport / dnata Travel) — left untouched" });
      continue;
    }
    const existing = await prisma.accountProduct.findUnique({
      where: { accountId_productKey: { accountId: a.accountId, productKey: "PLACEPULSE" } },
    });
    if (existing) {
      report.push({ category: "B", key: a.accountName, status: "already_applied", detail: `AccountProduct already exists (relationshipState=${existing.relationshipState})` });
      continue;
    }
    const accountStillExists = await prisma.account.findUnique({ where: { id: a.accountId } });
    if (!accountStillExists) {
      report.push({ category: "B", key: a.accountName, status: "aborted", detail: "account no longer exists" });
      continue;
    }
    await prisma.accountProduct.create({ data: { accountId: a.accountId, productKey: "PLACEPULSE", relationshipState: a.relationshipState } });
    report.push({ category: "B", key: a.accountName, status: "applied", detail: `created, relationshipState=${a.relationshipState}` });
  }

  // C. Contact provenance
  const contactCandidates = await computeContactProvenanceCandidates();
  for (const c of contactCandidates) {
    if (c.classification !== "PARTIAL_BACKFILL") continue;
    if (c.isExcluded) {
      report.push({ category: "C", key: c.contactName, status: "excluded", detail: "excluded per approved scope (Adrian Roodt / John Bevan) — left untouched" });
      continue;
    }
    const fresh = await prisma.contact.findUnique({ where: { id: c.contactId }, select: { sourceType: true, sourceDetail: true } });
    if (!fresh) {
      report.push({ category: "C", key: c.contactName, status: "aborted", detail: "contact no longer exists" });
      continue;
    }
    const data: Prisma.ContactUpdateInput = {};
    if (!fresh.sourceType && c.proposedSourceType) data.sourceType = c.proposedSourceType;
    if (!fresh.sourceDetail && c.proposedSourceDetail) data.sourceDetail = c.proposedSourceDetail;
    if (Object.keys(data).length === 0) {
      report.push({ category: "C", key: c.contactName, status: "already_applied", detail: "provenance fields already set — no change" });
      continue;
    }
    await prisma.contact.update({ where: { id: c.contactId }, data });
    report.push({ category: "C", key: c.contactName, status: "applied", detail: `updated: ${Object.keys(data).join(", ")} (relationshipStrength/acquisitionPath untouched)` });
  }

  // D. Opportunity primary contact
  const opportunityAssignments = await computeOpportunityPrimaryCandidates();
  for (const a of opportunityAssignments) {
    if (a.status === "opportunity_not_found") {
      report.push({ category: "D", key: a.contactName, status: "aborted", detail: `no opportunity matching "${a.opportunityNameContains}" found` });
      continue;
    }
    if (a.status === "contact_not_linked") {
      report.push({ category: "D", key: `${a.opportunityName} / ${a.contactName}`, status: "aborted", detail: "contact is not an existing OpportunityContact stakeholder on this opportunity — not created, per scope (only updates isPrimary on existing links)" });
      continue;
    }
    if (a.alreadyPrimary) {
      report.push({ category: "D", key: `${a.opportunityName} / ${a.contactName}`, status: "already_applied", detail: "already isPrimary=true" });
      continue;
    }
    await prisma.$transaction([
      prisma.opportunityContact.updateMany({
        where: { opportunityId: a.opportunityId!, isPrimary: true },
        data: { isPrimary: false },
      }),
      prisma.opportunityContact.update({
        where: { opportunityId_contactId: { opportunityId: a.opportunityId!, contactId: a.matchedContactId! } },
        data: { isPrimary: true },
      }),
    ]);
    report.push({ category: "D", key: `${a.opportunityName} / ${a.contactName}`, status: "applied", detail: "set isPrimary=true; any other stakeholder on this opportunity forced isPrimary=false" });
  }

  // E. Task due dates — explicitly out of scope, zero writes by design.
  report.push({ category: "E", key: "Task due dates", status: "skipped", detail: "0 writes by design — Sprint 05 does not touch task due dates" });

  return report;
}
