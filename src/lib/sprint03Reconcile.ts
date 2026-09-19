import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";

// ArqOne CRM Sprint 03 — production reconciliation. Every ID below is a
// specific, verified production record identified in the Sprint 02 audit —
// nothing here is discovered by fuzzy matching. Contacts for opportunity
// stakeholder linking are looked up by exact normalized name at execution
// time (the audit already confirmed zero duplicate contact names in
// production), and any lookup that doesn't resolve to exactly one record is
// reported as a skip, never guessed.
//
// executeSprint03() runs every write inside a single transaction: either the
// whole reconciliation lands, or nothing does. It is idempotent — re-running
// it after a partial or full success only applies what's still pending, so a
// retry after inspecting a report is always safe.
//
// Historical Activity creation (originally Phase 6) is intentionally NOT
// executed here: Activity.date has no nullable "unknown" representation and
// no verified ATM Dubai 2026 interaction date is stored anywhere in the CRM,
// so defaulting to execution time would make historical interactions look
// like they happened today. Excluded until real dates are supplied.

const KNOWN = {
  travelportAccountId: "cmu54mfsa0015la5xu4p0zqoj",
  adrianContactId: "cmu561w1t001t18nfbfaqj8kw",
  andyLeadId: "cmu5625hr002i18nf9sbsvxxx",
  accounts: {
    tourism365: "cmu54mfoy0005la5xp6kfd1dq",
    abuDhabiAirports: "cmu54mfp40007la5xl2od9ged",
    dohaOasis: "cmu54mfr0000rla5xt5odhtsl",
    sabre: "cmu54mfrx0011la5xdywv4rez",
  },
  opportunities: {
    tourism365: "cmu5627qg002m18nfsjkjvlty",
    abuDhabiAirports: "cmu5628ow002q18nfpc0dg5b2",
    dohaOasis: "cmu56299l002u18nf7xl1zqbv",
    sabre: "cmu5629th002y18nf11pq9vj3",
  },
} as const;

const OPP_TYPES: Record<string, string> = {
  [KNOWN.opportunities.sabre]: "STRATEGIC_PARTNERSHIP",
  [KNOWN.opportunities.tourism365]: "COMMERCIAL",
  [KNOWN.opportunities.abuDhabiAirports]: "COMMERCIAL",
  [KNOWN.opportunities.dohaOasis]: "COMMERCIAL",
};

const STAKEHOLDERS: { label: string; opportunityId: string; contactName: string }[] = [
  { label: "Tourism 365", opportunityId: KNOWN.opportunities.tourism365, contactName: "Andrew Gaied" },
  { label: "Abu Dhabi Airports", opportunityId: KNOWN.opportunities.abuDhabiAirports, contactName: "Jezael Carrasco" },
  { label: "Abu Dhabi Airports", opportunityId: KNOWN.opportunities.abuDhabiAirports, contactName: "Oriol Escofet Bueno" },
  { label: "Sabre", opportunityId: KNOWN.opportunities.sabre, contactName: "Ishaq Khattak" },
  { label: "Doha Oasis", opportunityId: KNOWN.opportunities.dohaOasis, contactName: "Muhammad Nasir" },
];

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function isAlreadyAdrianRoodt(firstName: string, lastName: string): boolean {
  return normalizeName(firstName) === "adrian" && normalizeName(lastName) === "roodt";
}

type StepReport = { step: string; status: "applied" | "already_applied" | "skipped"; detail: string };

async function findContactByName(tx: Prisma.TransactionClient, fullName: string) {
  const target = normalizeName(fullName);
  const candidates = await tx.contact.findMany({ select: { id: true, firstName: true, lastName: true } });
  return candidates.filter((c) => normalizeName(`${c.firstName} ${c.lastName}`) === target);
}

async function linkStakeholder(
  tx: Prisma.TransactionClient,
  report: StepReport[],
  s: { label: string; opportunityId: string; contactName: string }
) {
  const matches = await findContactByName(tx, s.contactName);
  if (matches.length === 0) {
    report.push({ step: `${s.label} — link ${s.contactName}`, status: "skipped", detail: "no Contact with this exact name exists — not created, per Sprint 03 scope" });
    return;
  }
  if (matches.length > 1) {
    report.push({ step: `${s.label} — link ${s.contactName}`, status: "skipped", detail: `ambiguous: ${matches.length} contacts match this name` });
    return;
  }
  const contactId = matches[0].id;
  const existing = await tx.opportunityContact.findUnique({
    where: { opportunityId_contactId: { opportunityId: s.opportunityId, contactId } },
  });
  if (existing) {
    report.push({ step: `${s.label} — link ${s.contactName}`, status: "already_applied", detail: `already linked (isPrimary=${existing.isPrimary})` });
    return;
  }
  await tx.opportunityContact.create({ data: { opportunityId: s.opportunityId, contactId, isPrimary: false } });
  report.push({ step: `${s.label} — link ${s.contactName}`, status: "applied", detail: `linked, isPrimary=false` });
}

// ─── PREVIEW ─────────────────────────────────────────────────────────────
// Read-only. Returns a full before-state / proposed-write diff for every
// phase, with record IDs, so the report can be reviewed and approved before
// executeSprint03() runs.

export async function previewSprint03() {
  const [adrianContact, andyLead, accounts, opportunities, allTasks, allContacts, allLeadsForBackfill] = await Promise.all([
    prisma.contact.findUnique({ where: { id: KNOWN.adrianContactId } }),
    prisma.lead.findUnique({ where: { id: KNOWN.andyLeadId } }),
    prisma.account.findMany({ where: { id: { in: Object.values(KNOWN.accounts) } } }),
    prisma.opportunity.findMany({ where: { id: { in: Object.values(KNOWN.opportunities) } }, include: { contacts: { include: { contact: true } } } }),
    prisma.task.findMany(),
    prisma.contact.findMany({ select: { id: true, firstName: true, lastName: true } }),
    prisma.lead.findMany({ select: { id: true, name: true, company: true, accountId: true } }),
  ]);

  // Phase 1 — Contact
  const contactPhase1 = adrianContact
    ? {
        id: adrianContact.id,
        before: { firstName: adrianContact.firstName, lastName: adrianContact.lastName },
        alreadyCanonical: isAlreadyAdrianRoodt(adrianContact.firstName, adrianContact.lastName),
        after: isAlreadyAdrianRoodt(adrianContact.firstName, adrianContact.lastName)
          ? null
          : { firstName: "Adrian", lastName: "Roodt" },
        provenanceBefore: {
          sourceType: adrianContact.sourceType,
          sourceDetail: adrianContact.sourceDetail,
          acquisitionPath: adrianContact.acquisitionPath,
          relationshipStrength: adrianContact.relationshipStrength,
        },
        provenanceAfter: { sourceType: "EVENT", sourceDetail: "ATM Dubai 2026", acquisitionPath: "DIRECT_MEETING", relationshipStrength: "ENGAGED" },
      }
    : { error: `contact ${KNOWN.adrianContactId} not found` };

  // Phase 1 — Lead
  const leadPhase1 = andyLead
    ? {
        id: andyLead.id,
        before: andyLead.name,
        after: "Adrian Roodt — Travelport",
        willChange: andyLead.name !== "Adrian Roodt — Travelport",
      }
    : { error: `lead ${KNOWN.andyLeadId} not found` };

  // Phase 2 — Lead.accountId backfill: full per-lead table
  const accountByNormName = new Map(
    (await prisma.account.findMany({ select: { id: true, name: true } })).map((a) => [normalizeName(a.name), { id: a.id, name: a.name }])
  );
  const leadBackfillRows = allLeadsForBackfill
    .filter((l) => l.accountId === null)
    .map((l) => {
      const match = l.company ? accountByNormName.get(normalizeName(l.company)) : undefined;
      return {
        leadId: l.id,
        leadName: l.name,
        company: l.company,
        matchedAccountId: match?.id ?? null,
        matchedAccountName: match?.name ?? null,
        willBackfill: !!match,
      };
    });
  const leadBackfillMatched = leadBackfillRows.filter((r) => r.willBackfill).length;
  const leadBackfillUnmatched = leadBackfillRows.filter((r) => !r.willBackfill);

  // Phase 3 — AccountProduct
  const existingAccountProducts = await prisma.accountProduct.findMany({
    where: { accountId: { in: Object.values(KNOWN.accounts) }, productKey: "PLACEPULSE" },
  });
  const existingByAccount = new Map(existingAccountProducts.map((ap) => [ap.accountId, ap]));
  const accountProductRows = accounts.map((a) => ({
    accountId: a.id,
    accountName: a.name,
    before: existingByAccount.get(a.id)?.relationshipState ?? null,
    after: "OPPORTUNITY",
    willCreate: !existingByAccount.has(a.id),
  }));

  // Phase 4 — Opportunity types
  const oppTypeRows = opportunities.map((o) => ({
    opportunityId: o.id,
    name: o.name,
    before: o.type,
    after: OPP_TYPES[o.id] ?? null,
    willChange: o.type !== (OPP_TYPES[o.id] ?? o.type),
  }));

  // Phase 5 — stakeholder links
  const stakeholderRows = await Promise.all(
    STAKEHOLDERS.map(async (s) => {
      const matches = allContacts.filter((c) => normalizeName(`${c.firstName} ${c.lastName}`) === normalizeName(s.contactName));
      if (matches.length !== 1) {
        return { ...s, status: matches.length === 0 ? "skipped_not_found" : "skipped_ambiguous", matchCount: matches.length };
      }
      const opp = opportunities.find((o) => o.id === s.opportunityId);
      const alreadyLinked = opp?.contacts.some((oc) => oc.contactId === matches[0].id) ?? false;
      return {
        ...s,
        contactId: matches[0].id,
        status: alreadyLinked ? "already_linked" : "will_link",
        isPrimary: false,
      };
    })
  );

  // Phase 6 — excluded
  const activityCount = await prisma.activity.count();

  // Phase 7 — task cleanup
  const tasksReferencingAndy = allTasks.filter(
    (t) => t.title.toLowerCase().includes("andy") || (t.notes ?? "").toLowerCase().includes("andy")
  );

  return {
    phase1_contact: contactPhase1,
    phase1_lead: leadPhase1,
    phase2_leadAccountBackfill: {
      totalLeadsWithoutAccount: leadBackfillRows.length,
      willMatch: leadBackfillMatched,
      unmatched: leadBackfillUnmatched,
      rows: leadBackfillRows,
    },
    phase3_accountProduct: accountProductRows,
    phase4_opportunityTypes: oppTypeRows,
    phase5_stakeholderLinks: stakeholderRows,
    phase6_activities: {
      status: "EXCLUDED_FROM_EXECUTION",
      reason: "No verified ATM Dubai 2026 interaction date exists anywhere in the CRM; Activity.date is non-nullable and would default to execution time, misrepresenting historical interactions as happening today.",
      activityCountBefore: activityCount,
      proposedButNotExecuted: [
        "Andrew Gaied / Tourism 365",
        "Jezael Carrasco / Abu Dhabi Airports",
        "Oriol Escofet Bueno / Abu Dhabi Airports",
        "Ishaq Khattak / Sabre",
        "Muhammad Nasir / Doha Oasis",
        "Adrian Roodt / Travelport",
      ],
    },
    phase7_taskCleanup: {
      tasksReferencingAndy: tasksReferencingAndy.map((t) => ({ id: t.id, title: t.title, notes: t.notes })),
    },
  };
}

export async function executeSprint03() {
  const report: StepReport[] = [];

  await prisma.$transaction(async (tx) => {
    // ── PHASE 1: Travelport Contact — normalize only if needed ────────────
    const adrianContact = await tx.contact.findUnique({ where: { id: KNOWN.adrianContactId } });
    if (!adrianContact) {
      report.push({ step: "Phase 1 — Contact normalize", status: "skipped", detail: `contact ${KNOWN.adrianContactId} not found` });
    } else if (isAlreadyAdrianRoodt(adrianContact.firstName, adrianContact.lastName) && adrianContact.firstName === "Adrian" && adrianContact.lastName === "Roodt") {
      report.push({ step: "Phase 1 — Contact normalize", status: "already_applied", detail: "already exactly 'Adrian Roodt' — no change" });
    } else {
      await tx.contact.update({
        where: { id: KNOWN.adrianContactId },
        data: {
          firstName: "Adrian",
          lastName: "Roodt",
          sourceType: "EVENT",
          sourceDetail: "ATM Dubai 2026",
          acquisitionPath: "DIRECT_MEETING",
          relationshipStrength: "ENGAGED",
        },
      });
      report.push({
        step: "Phase 1 — Contact normalize",
        status: "applied",
        detail: `${KNOWN.adrianContactId} normalized '${adrianContact.firstName} ${adrianContact.lastName}' -> 'Adrian Roodt', provenance set (same ID preserved)`,
      });
    }

    const andyLead = await tx.lead.findUnique({ where: { id: KNOWN.andyLeadId } });
    if (!andyLead) {
      report.push({ step: "Phase 1 — Lead rename", status: "skipped", detail: `lead ${KNOWN.andyLeadId} not found` });
    } else if (andyLead.name === "Adrian Roodt — Travelport") {
      report.push({ step: "Phase 1 — Lead rename", status: "already_applied", detail: "already renamed" });
    } else {
      await tx.lead.update({ where: { id: KNOWN.andyLeadId }, data: { name: "Adrian Roodt — Travelport" } });
      report.push({ step: "Phase 1 — Lead rename", status: "applied", detail: `${KNOWN.andyLeadId} renamed '${andyLead.name}' -> 'Adrian Roodt — Travelport' (same ID preserved)` });
    }

    // ── PHASE 2: deterministic Lead.accountId backfill ────────────────────
    const accounts = await tx.account.findMany({ select: { id: true, name: true } });
    const accountByNormName = new Map(accounts.map((a) => [normalizeName(a.name), a.id]));
    const leadsToBackfill = await tx.lead.findMany({ where: { accountId: null }, select: { id: true, company: true, name: true } });
    let backfilled = 0;
    let unmatched = 0;
    for (const lead of leadsToBackfill) {
      const accountId = lead.company ? accountByNormName.get(normalizeName(lead.company)) : undefined;
      if (!accountId) {
        unmatched++;
        continue;
      }
      await tx.lead.update({ where: { id: lead.id }, data: { accountId } });
      backfilled++;
    }
    report.push({
      step: "Phase 2 — Lead.accountId backfill",
      status: backfilled > 0 ? "applied" : "already_applied",
      detail: `${backfilled} leads backfilled, ${unmatched} left unmatched (no exact company->account match)`,
    });

    // ── PHASE 3: AccountProduct backfill ──────────────────────────────────
    for (const [label, accountId] of Object.entries(KNOWN.accounts)) {
      const account = await tx.account.findUnique({ where: { id: accountId } });
      if (!account) {
        report.push({ step: `Phase 3 — AccountProduct (${label})`, status: "skipped", detail: `account ${accountId} not found` });
        continue;
      }
      const existing = await tx.accountProduct.findUnique({
        where: { accountId_productKey: { accountId, productKey: "PLACEPULSE" } },
      });
      if (existing) {
        report.push({ step: `Phase 3 — AccountProduct (${account.name})`, status: "already_applied", detail: `relationshipState=${existing.relationshipState}` });
        continue;
      }
      await tx.accountProduct.create({ data: { accountId, productKey: "PLACEPULSE", relationshipState: "OPPORTUNITY" } });
      report.push({ step: `Phase 3 — AccountProduct (${account.name})`, status: "applied", detail: "created, relationshipState=OPPORTUNITY" });
    }

    // ── PHASE 4: Opportunity types ─────────────────────────────────────────
    for (const [oppId, type] of Object.entries(OPP_TYPES)) {
      const opp = await tx.opportunity.findUnique({ where: { id: oppId } });
      if (!opp) {
        report.push({ step: `Phase 4 — Opportunity type (${oppId})`, status: "skipped", detail: "opportunity not found" });
        continue;
      }
      if (opp.type === type) {
        report.push({ step: `Phase 4 — Opportunity type (${opp.name})`, status: "already_applied", detail: `already ${type}` });
        continue;
      }
      await tx.opportunity.update({ where: { id: oppId }, data: { type } });
      report.push({ step: `Phase 4 — Opportunity type (${opp.name})`, status: "applied", detail: `set to ${type}` });
    }

    // ── PHASE 5: stakeholder linking (existing contacts only) ─────────────
    for (const s of STAKEHOLDERS) {
      await linkStakeholder(tx, report, s);
    }

    // ── PHASE 6: historical Activity baseline — EXCLUDED ───────────────────
    report.push({
      step: "Phase 6 — Historical activities",
      status: "skipped",
      detail: "Excluded from this execution: no verified ATM Dubai 2026 interaction date exists in the CRM, and Activity.date would otherwise default to execution time.",
    });

    // ── PHASE 7: existing task cleanup (Andy references only) ─────────────
    const tasks = await tx.task.findMany();
    let anyTaskFixed = false;
    for (const t of tasks) {
      const titleHasAndy = t.title.toLowerCase().includes("andy");
      const notesHasAndy = (t.notes ?? "").toLowerCase().includes("andy");
      if (!titleHasAndy && !notesHasAndy) continue;
      anyTaskFixed = true;
      const newTitle = t.title.replace(/Andy(\s*-\s*Travelport)?/gi, "Adrian Roodt");
      const newNotes = t.notes ? t.notes.replace(/Andy(\s*-\s*Travelport)?/gi, "Adrian Roodt") : t.notes;
      await tx.task.update({ where: { id: t.id }, data: { title: newTitle, notes: newNotes } });
      report.push({ step: `Phase 7 — Task cleanup (${t.id})`, status: "applied", detail: `'Andy' reference corrected to 'Adrian Roodt' — title: "${newTitle}"` });
    }
    if (!anyTaskFixed) {
      report.push({ step: "Phase 7 — Task cleanup", status: "already_applied", detail: "no task currently references 'Andy'" });
    }
  });

  return report;
}
