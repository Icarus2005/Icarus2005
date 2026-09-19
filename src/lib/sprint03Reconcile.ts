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

const KNOWN = {
  travelportAccountId: "cmu54mfsa0015la5xu4p0zqoj",
  andyContactId: "cmu561w1t001t18nfbfaqj8kw",
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

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

type StepReport = { step: string; status: "applied" | "already_applied" | "skipped"; detail: string };

async function findContactByName(tx: Prisma.TransactionClient, fullName: string) {
  const target = normalizeName(fullName);
  const candidates = await tx.contact.findMany({ select: { id: true, firstName: true, lastName: true } });
  const matches = candidates.filter((c) => normalizeName(`${c.firstName} ${c.lastName}`) === target);
  return matches;
}

async function linkStakeholder(
  tx: Prisma.TransactionClient,
  report: StepReport[],
  opportunityLabel: string,
  opportunityId: string,
  contactName: string,
  isPrimary: boolean
) {
  const matches = await findContactByName(tx, contactName);
  if (matches.length === 0) {
    report.push({ step: `${opportunityLabel} — link ${contactName}`, status: "skipped", detail: "no Contact with this exact name exists — not created, per Sprint 03 scope" });
    return;
  }
  if (matches.length > 1) {
    report.push({ step: `${opportunityLabel} — link ${contactName}`, status: "skipped", detail: `ambiguous: ${matches.length} contacts match this name` });
    return;
  }
  const contactId = matches[0].id;
  const existing = await tx.opportunityContact.findUnique({
    where: { opportunityId_contactId: { opportunityId, contactId } },
  });
  if (existing) {
    report.push({ step: `${opportunityLabel} — link ${contactName}`, status: "already_applied", detail: `already linked (isPrimary=${existing.isPrimary})` });
    return;
  }
  await tx.opportunityContact.create({ data: { opportunityId, contactId, isPrimary } });
  report.push({ step: `${opportunityLabel} — link ${contactName}`, status: "applied", detail: `linked, isPrimary=${isPrimary}` });
}

async function ensureActivity(
  tx: Prisma.TransactionClient,
  report: StepReport[],
  opts: {
    label: string;
    type: string;
    subject: string;
    notes: string;
    accountId?: string;
    contactName?: string;
    leadId?: string;
    opportunityId?: string;
  }
) {
  let contactId: string | undefined;
  if (opts.contactName) {
    const matches = await findContactByName(tx, opts.contactName);
    if (matches.length === 1) contactId = matches[0].id;
  }
  const existing = await tx.activity.findFirst({
    where: { subject: opts.subject, accountId: opts.accountId ?? null, contactId: contactId ?? null },
  });
  if (existing) {
    report.push({ step: opts.label, status: "already_applied", detail: "an activity with this exact subject/account/contact already exists" });
    return;
  }
  await tx.activity.create({
    data: {
      type: opts.type,
      subject: opts.subject,
      notes: opts.notes,
      product: "PLACEPULSE",
      accountId: opts.accountId,
      contactId,
      leadId: opts.leadId,
      opportunityId: opts.opportunityId,
      // No confirmed ATM Dubai 2026 interaction date is stored anywhere in
      // the CRM (no dedicated event-date field on Lead/Contact/Account) —
      // per Sprint 03 Phase 6, we do not invent a timestamp. `date` defaults
      // to the record's creation time; the notes state the event context.
    },
  });
  report.push({ step: opts.label, status: "applied", detail: contactId ? "created, linked to matched contact" : "created (contact not linked — no unambiguous match)" });
}

export async function previewSprint03() {
  const [andyContact, andyLead, accounts, opportunities, tasks] = await Promise.all([
    prisma.contact.findUnique({ where: { id: KNOWN.andyContactId } }),
    prisma.lead.findUnique({ where: { id: KNOWN.andyLeadId } }),
    prisma.account.findMany({ where: { id: { in: Object.values(KNOWN.accounts) } } }),
    prisma.opportunity.findMany({ where: { id: { in: Object.values(KNOWN.opportunities) } }, include: { contacts: true } }),
    prisma.task.findMany(),
  ]);
  const leadsWithoutAccount = await prisma.lead.count({ where: { accountId: null } });
  const accountProductCount = await prisma.accountProduct.count({
    where: { accountId: { in: Object.values(KNOWN.accounts) }, productKey: "PLACEPULSE" },
  });
  const activityCount = await prisma.activity.count();
  const tasksReferencingAndy = tasks.filter(
    (t) => t.title.toLowerCase().includes("andy") || (t.notes ?? "").toLowerCase().includes("andy")
  );

  return {
    andyContact: andyContact ? { id: andyContact.id, firstName: andyContact.firstName, lastName: andyContact.lastName } : null,
    andyLead: andyLead ? { id: andyLead.id, name: andyLead.name } : null,
    accountsFound: accounts.map((a) => ({ id: a.id, name: a.name })),
    opportunitiesFound: opportunities.map((o) => ({ id: o.id, name: o.name, type: o.type, contactCount: o.contacts.length })),
    leadsWithoutAccount,
    accountProductRowsAlreadyPresent: accountProductCount,
    accountProductRowsToCreate: 4 - accountProductCount,
    activityCountBefore: activityCount,
    tasksReferencingAndy: tasksReferencingAndy.map((t) => ({ id: t.id, title: t.title })),
  };
}

export async function executeSprint03() {
  const report: StepReport[] = [];

  await prisma.$transaction(async (tx) => {
    // ── PHASE 1: Travelport Andy -> Adrian Roodt ──────────────────────────
    const andyContact = await tx.contact.findUnique({ where: { id: KNOWN.andyContactId } });
    if (!andyContact) {
      report.push({ step: "Phase 1 — Contact rename", status: "skipped", detail: `contact ${KNOWN.andyContactId} not found` });
    } else if (andyContact.firstName === "Adrian" && andyContact.lastName === "Roodt") {
      report.push({ step: "Phase 1 — Contact rename", status: "already_applied", detail: "already Adrian Roodt" });
    } else {
      await tx.contact.update({
        where: { id: KNOWN.andyContactId },
        data: {
          firstName: "Adrian",
          lastName: "Roodt",
          sourceType: "EVENT",
          sourceDetail: "ATM Dubai 2026",
          acquisitionPath: "DIRECT_MEETING",
          relationshipStrength: "ENGAGED",
        },
      });
      report.push({ step: "Phase 1 — Contact rename", status: "applied", detail: `${KNOWN.andyContactId} renamed 'Andy' -> 'Adrian Roodt', provenance set` });
    }

    const andyLead = await tx.lead.findUnique({ where: { id: KNOWN.andyLeadId } });
    if (!andyLead) {
      report.push({ step: "Phase 1 — Lead rename", status: "skipped", detail: `lead ${KNOWN.andyLeadId} not found` });
    } else if (andyLead.name === "Adrian Roodt — Travelport") {
      report.push({ step: "Phase 1 — Lead rename", status: "already_applied", detail: "already renamed" });
    } else {
      await tx.lead.update({
        where: { id: KNOWN.andyLeadId },
        data: { name: "Adrian Roodt — Travelport" },
      });
      report.push({ step: "Phase 1 — Lead rename", status: "applied", detail: `${KNOWN.andyLeadId} renamed 'Andy - Travelport' -> 'Adrian Roodt — Travelport'` });
    }

    // ── PHASE 2: deterministic Lead.accountId backfill ────────────────────
    const accounts = await tx.account.findMany({ select: { id: true, name: true } });
    const accountByNormName = new Map(accounts.map((a) => [normalizeName(a.name), a.id]));
    const leadsToBackfill = await tx.lead.findMany({ where: { accountId: null }, select: { id: true, company: true, name: true } });
    let backfilled = 0;
    let unmatched = 0;
    for (const lead of leadsToBackfill) {
      if (!lead.company) {
        unmatched++;
        continue;
      }
      const accountId = accountByNormName.get(normalizeName(lead.company));
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
      await tx.accountProduct.create({
        data: { accountId, productKey: "PLACEPULSE", relationshipState: "OPPORTUNITY" },
      });
      report.push({ step: `Phase 3 — AccountProduct (${account.name})`, status: "applied", detail: "created, relationshipState=OPPORTUNITY" });
    }

    // ── PHASE 4: Opportunity types ─────────────────────────────────────────
    const oppTypes: Record<string, string> = {
      [KNOWN.opportunities.sabre]: "STRATEGIC_PARTNERSHIP",
      [KNOWN.opportunities.tourism365]: "COMMERCIAL",
      [KNOWN.opportunities.abuDhabiAirports]: "COMMERCIAL",
      [KNOWN.opportunities.dohaOasis]: "COMMERCIAL",
    };
    for (const [oppId, type] of Object.entries(oppTypes)) {
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
    await linkStakeholder(tx, report, "Tourism 365", KNOWN.opportunities.tourism365, "Andrew Gaied", false);
    await linkStakeholder(tx, report, "Abu Dhabi Airports", KNOWN.opportunities.abuDhabiAirports, "Jezael Carrasco", false);
    await linkStakeholder(tx, report, "Abu Dhabi Airports", KNOWN.opportunities.abuDhabiAirports, "Oriol Escofet Bueno", false);
    await linkStakeholder(tx, report, "Sabre", KNOWN.opportunities.sabre, "Ishaq Khattak", false);
    await linkStakeholder(tx, report, "Doha Oasis", KNOWN.opportunities.dohaOasis, "Muhammad Nasir", false);

    // ── PHASE 6: historical activity baseline ──────────────────────────────
    await ensureActivity(tx, report, {
      label: "Phase 6 — Activity: Andrew Gaied / Tourism 365",
      type: "EVENT_INTERACTION",
      subject: "ATM Dubai 2026 — Andrew Gaied, Tourism 365",
      notes: "Personally met at ATM Dubai 2026. Strong PlacePulse discussion/demo. Andrew referred Piero to Rebin Baby (not yet a CRM record).",
      accountId: KNOWN.accounts.tourism365,
      contactName: "Andrew Gaied",
      opportunityId: KNOWN.opportunities.tourism365,
    });
    await ensureActivity(tx, report, {
      label: "Phase 6 — Activity: Jezael Carrasco / Abu Dhabi Airports",
      type: "EVENT_INTERACTION",
      subject: "ATM Dubai 2026 — Jezael Carrasco, Abu Dhabi Airports",
      notes: "Personally met at ATM Dubai 2026. Strong PlacePulse/location-intelligence discussion. Follow-up interest expressed.",
      accountId: KNOWN.accounts.abuDhabiAirports,
      contactName: "Jezael Carrasco",
      opportunityId: KNOWN.opportunities.abuDhabiAirports,
    });
    await ensureActivity(tx, report, {
      label: "Phase 6 — Activity: Oriol Escofet Bueno / Abu Dhabi Airports",
      type: "EVENT_INTERACTION",
      subject: "ATM Dubai 2026 — Oriol Escofet Bueno, Abu Dhabi Airports",
      notes: "Personally met at ATM Dubai 2026, part of the same Abu Dhabi Airports discussion as Jezael Carrasco.",
      accountId: KNOWN.accounts.abuDhabiAirports,
      contactName: "Oriol Escofet Bueno",
      opportunityId: KNOWN.opportunities.abuDhabiAirports,
    });
    await ensureActivity(tx, report, {
      label: "Phase 6 — Activity: Ishaq Khattak / Sabre",
      type: "EVENT_INTERACTION",
      subject: "ATM Dubai 2026 — Ishaq Khattak, Sabre",
      notes: "Personally engaged in strategic PlacePulse partnership discussion. An existing task references a Bahrain Airport introduction.",
      accountId: KNOWN.accounts.sabre,
      contactName: "Ishaq Khattak",
      opportunityId: KNOWN.opportunities.sabre,
    });
    await ensureActivity(tx, report, {
      label: "Phase 6 — Activity: Muhammad Nasir / Doha Oasis",
      type: "EVENT_INTERACTION",
      subject: "ATM Dubai 2026 — Muhammad Nasir, Doha Oasis",
      notes: "Personally engaged around PlacePulse destination intelligence. An existing task references a detailed demo post-show.",
      accountId: KNOWN.accounts.dohaOasis,
      contactName: "Muhammad Nasir",
      opportunityId: KNOWN.opportunities.dohaOasis,
    });
    await ensureActivity(tx, report, {
      label: "Phase 6 — Activity: Adrian Roodt / Travelport",
      type: "EVENT_INTERACTION",
      subject: "ATM Dubai 2026 — Adrian Roodt, Travelport",
      notes:
        "Personally met at ATM Dubai 2026. Substantive strategic partnership/ecosystem discussion. Adrian wanted to introduce Piero to relevant partners at the stand; those partners were unavailable at the time, and Piero intended to return but did not manage to reconnect.",
      accountId: KNOWN.travelportAccountId,
      contactName: "Adrian Roodt",
      leadId: KNOWN.andyLeadId,
    });

    // ── PHASE 7: existing task cleanup (Andy references only) ─────────────
    const tasks = await tx.task.findMany();
    for (const t of tasks) {
      const titleHasAndy = t.title.toLowerCase().includes("andy");
      const notesHasAndy = (t.notes ?? "").toLowerCase().includes("andy");
      if (!titleHasAndy && !notesHasAndy) continue;
      const newTitle = t.title.replace(/Andy(\s*-\s*Travelport)?/gi, "Adrian Roodt");
      const newNotes = t.notes ? t.notes.replace(/Andy(\s*-\s*Travelport)?/gi, "Adrian Roodt") : t.notes;
      await tx.task.update({ where: { id: t.id }, data: { title: newTitle, notes: newNotes } });
      report.push({ step: `Phase 7 — Task cleanup (${t.id})`, status: "applied", detail: `'Andy' reference corrected to 'Adrian Roodt' — title: "${newTitle}"` });
    }
    if (!tasks.some((t) => t.title.toLowerCase().includes("andy") || (t.notes ?? "").toLowerCase().includes("andy"))) {
      report.push({ step: "Phase 7 — Task cleanup", status: "already_applied", detail: "no task currently references 'Andy'" });
    }
  });

  return report;
}
