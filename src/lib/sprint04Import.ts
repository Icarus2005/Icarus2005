import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";

// ArqOne CRM Sprint 04 — controlled ATM/post-ATM contact import.
//
// Every person below is defined by a PersonSpec with exact provenance taken
// from the canonical facts given by the CRM owner — no titles, emails,
// meetings or opportunity status are invented anywhere in this file. Matching
// is always by exact normalized name (never fuzzy); a name matching more
// than one existing Contact/Lead is reported as a conflict and skipped, never
// guessed. `mustAlreadyExist` people (Bernard Kamau, Olga Grigorieva) are
// reconciled only — if no unique existing record is found, they are skipped
// and reported rather than created, since the CRM owner confirmed these
// already exist. `existingCheckOnly` (Adrian Roodt) and `holdForLater`
// (Phase 7 list) people are read-only in both preview and execute.
//
// executeImport() runs every write inside a single transaction. It is
// idempotent: re-running it after a partial or full success only applies
// what's still pending.

const KNOWN_ACCOUNTS = {
  tourism365: "cmu54mfoy0005la5xp6kfd1dq",
  travelport: "cmu54mfsa0015la5xu4p0zqoj",
} as const;

const KNOWN_OPPORTUNITIES = {
  tourism365: "cmu5627qg002m18nfsjkjvlty",
} as const;

const KNOWN_CONTACTS = {
  adrianRoodt: "cmu561w1t001t18nfbfaqj8kw",
} as const;

type PersonSpec = {
  key: string;
  fullName: string;
  accountName: string; // canonical account name to reuse-or-create
  title?: string; // only ever set when explicitly verified
  relationshipStrength?: string;
  sourceType?: string;
  sourceDetail?: string;
  acquisitionPath?: string;
  referredByName?: string;
  leadStatus?: string; // omit => no Lead created, link Contact to Opportunity directly instead
  salesMotion?: string;
  opportunityKey?: keyof typeof KNOWN_OPPORTUNITIES;
  isPrimaryStakeholder?: boolean;
  taskTitle?: string;
  mustAlreadyExist?: boolean;
  existingCheckOnly?: boolean;
  holdForLater?: boolean;
  note?: string; // surfaced in the report for any judgment call made resolving an ambiguous enum
};

const PEOPLE: PersonSpec[] = [
  // ── Phase 2 — verified commercial/strategic, personally met ────────────
  {
    key: "rebin_baby",
    fullName: "Rebin Baby",
    accountName: "Tourism 365",
    relationshipStrength: "ENGAGED",
    sourceType: "EVENT",
    sourceDetail: "ATM Dubai 2026",
    acquisitionPath: "DIRECT_MEETING",
    opportunityKey: "tourism365",
    isPrimaryStakeholder: false,
    taskTitle: "Prepare / send bespoke ADNEC-Tourism365 follow-up and progress meeting",
  },
  {
    key: "yara_el_dehni",
    fullName: "Yara El Dehni",
    accountName: "Tourism 365",
    title: "General Manager, Tourism365",
    relationshipStrength: "ENGAGED",
    sourceType: "EVENT",
    sourceDetail: "ATM Dubai 2026",
    acquisitionPath: "INTRODUCTION",
    referredByName: "Rebin Baby",
    opportunityKey: "tourism365",
    isPrimaryStakeholder: false,
    note: "acquisitionPath INTRODUCED_BY_CONTACT has no exact schema enum match — mapped to closest valid value INTRODUCTION.",
  },
  {
    key: "roger_mosoti",
    fullName: "Roger Mosoti",
    accountName: "Atlantis Dubai",
    title: "Assistant Manager Sales",
    relationshipStrength: "ENGAGED",
    sourceType: "EVENT",
    sourceDetail: "ATM Dubai 2026",
    acquisitionPath: "DIRECT_MEETING",
    leadStatus: "ENGAGED",
    taskTitle: "Send tailored Atlantis follow-up and seek stakeholder introduction",
  },
  {
    key: "srushti_hatwar",
    fullName: "Srushti Hatwar",
    accountName: "Emaar Entertainment",
    relationshipStrength: "ENGAGED",
    sourceType: "EVENT",
    sourceDetail: "ATM Dubai 2026",
    acquisitionPath: "DIRECT_MEETING",
    leadStatus: "ENGAGED",
    taskTitle: "Follow up for relevant Emaar Entertainment decision-maker / use-case owner",
  },
  {
    key: "christina_reynolds",
    fullName: "Christina Reynolds",
    accountName: "Dubai Department of Economy & Tourism (DET)",
    relationshipStrength: "ENGAGED",
    sourceType: "EVENT",
    sourceDetail: "ATM Dubai 2026",
    acquisitionPath: "DIRECT_MEETING",
    leadStatus: "ENGAGED",
    taskTitle: "Follow up for appropriate DET internal introduction",
    note: "relationshipStrength: spec allows WARM or ENGAGED — WARM has no schema enum, and the spec's own fallback preference is ENGAGED when supported, so ENGAGED was used.",
  },

  // ── Phase 3 — referred, NOT personally met ──────────────────────────────
  {
    key: "khaled_amer",
    fullName: "Khaled Amer",
    accountName: "Millennium Hotels & Resorts",
    title: "VP Commercial",
    relationshipStrength: "REFERRED",
    sourceType: "REFERRAL",
    sourceDetail: "ATM Dubai 2026 — Millennium stand referral",
    acquisitionPath: "STAND_REFERRAL",
    leadStatus: "NEW",
    taskTitle: "Send referral-based PlacePulse introduction",
    note: "relationshipStrength WARM_REFERRAL has no schema enum — mapped to closest valid value REFERRED.",
  },
  {
    key: "balamurugan_t",
    fullName: "Balamurugan T",
    accountName: "EmQuest",
    title: "Key Account Manager",
    relationshipStrength: "REFERRED",
    sourceType: "REFERRAL",
    sourceDetail: "ATM Dubai 2026 — contact provided at stand",
    acquisitionPath: "CARD_PROVIDED",
    leadStatus: "NEW",
    taskTitle: "Send conservative EmQuest referral introduction",
    note: "acquisitionPath: spec text said REFERRED_BY_COMPANY_TEAM but the canonical relationship ('handed his card, never spoke to him') matches the schema's CARD_PROVIDED enum more precisely — used CARD_PROVIDED. Flag for review if this doesn't match intent.",
  },
  {
    key: "mikin_ajwani",
    fullName: "Mikin Ajwani",
    accountName: "Accor",
    relationshipStrength: "REFERRED",
    sourceType: "REFERRAL",
    sourceDetail: "ATM Dubai 2026 — Accor stand referral",
    acquisitionPath: "STAND_REFERRAL",
    leadStatus: "NEW",
  },
  {
    key: "wahid_khashaba",
    fullName: "Wahid Khashaba",
    accountName: "Rotana",
    title: "Director of Business Development",
    relationshipStrength: "REFERRED",
    sourceType: "REFERRAL",
    sourceDetail: "ATM Dubai 2026 — Rotana stand referral",
    acquisitionPath: "STAND_REFERRAL",
    leadStatus: "NEW",
  },
  {
    key: "olga_grigorieva",
    fullName: "Olga Grigorieva",
    accountName: "EmQuest",
    relationshipStrength: "REFERRED",
    sourceType: "REFERRAL",
    sourceDetail: "ATM Dubai 2026 — referred by EmQuest colleagues",
    acquisitionPath: "STAND_REFERRAL",
    mustAlreadyExist: true,
  },

  // ── Phase 4 — verified personally met existing/legacy ───────────────────
  {
    key: "abir_abidi",
    fullName: "Abir Abidi",
    accountName: "Wyndham Doha West Bay",
    title: "Director of Sales & Marketing",
    relationshipStrength: "ENGAGED",
    sourceType: "EVENT",
    sourceDetail: "ATM Dubai 2026",
    acquisitionPath: "DIRECT_MEETING",
    leadStatus: "ENGAGED",
    taskTitle: "Follow up on internal guidance / relevant Wyndham stakeholder",
  },
  {
    key: "bernard_kamau",
    fullName: "Bernard Kamau",
    accountName: "Emaar Hospitality Group",
    relationshipStrength: "MET",
    sourceType: "EVENT",
    sourceDetail: "ATM Dubai 2026",
    acquisitionPath: "DIRECT_MEETING",
    mustAlreadyExist: true,
    note: "relationshipStrength: spec allows WARM/ENGAGED but cautions 'do not overstate' for a briefer interaction than the other Phase 2/4 contacts — used MET rather than ENGAGED. Flag for review if ENGAGED was intended.",
  },
  {
    key: "adrian_roodt",
    fullName: "Adrian Roodt",
    accountName: "Travelport",
    existingCheckOnly: true,
  },

  // ── Phase 5 — strategic/API partnership ─────────────────────────────────
  {
    key: "konstantinos_panagiotakis",
    fullName: "Konstantinos Panagiotakis",
    accountName: "GIATA",
    title: "Regional Sales Director Europe & Africa",
    relationshipStrength: "ENGAGED",
    sourceType: "EVENT",
    sourceDetail: "ATM Dubai 2026",
    acquisitionPath: "DIRECT_MEETING",
    leadStatus: "ENGAGED",
    salesMotion: "PARTNER",
    taskTitle: "Develop GIATA partnership hypothesis / API discussion follow-up",
    note: "salesMotion PARTNERSHIP has no schema enum — mapped to closest valid value PARTNER.",
  },
  {
    key: "bhaji_bhadran",
    fullName: "Bhaji Bhadran",
    accountName: "RateHawk",
    title: "Senior Business Development Manager",
    relationshipStrength: "ENGAGED",
    sourceType: "EVENT",
    sourceDetail: "ATM Dubai 2026",
    acquisitionPath: "DIRECT_MEETING",
    leadStatus: "ENGAGED",
    salesMotion: "PARTNER",
    taskTitle: "Develop RateHawk partnership hypothesis / API discussion follow-up",
  },
  {
    key: "pablo_rojas_gomez",
    fullName: "Pablo Rojas Gomez",
    accountName: "Travel Compositor",
    title: "Senior Sales Manager EMEA",
    relationshipStrength: "ENGAGED",
    sourceType: "EVENT",
    sourceDetail: "ATM Dubai 2026",
    acquisitionPath: "DIRECT_MEETING",
    leadStatus: "ENGAGED",
    salesMotion: "PARTNER",
    taskTitle: "Develop Travel Compositor partnership hypothesis / collaboration follow-up",
  },

  // ── Phase 6 — existing relationship / post-ATM ──────────────────────────
  {
    key: "emil_petrov",
    fullName: "Emil Petrov",
    accountName: "RAK Tourism Development Authority (RAKTDA)",
    title: "Head of Strategy",
    relationshipStrength: "ENGAGED",
    sourceType: "EXISTING_RELATIONSHIP",
    sourceDetail: "Reconnected around ATM Dubai 2026",
    acquisitionPath: "EXISTING_RELATIONSHIP",
    leadStatus: "ENGAGED",
    taskTitle: "Send RAK-specific PlacePulse deck/demo link by email",
  },

  // ── Phase 7 — hold for later, report/conflict-check only ────────────────
  { key: "john_bevan", fullName: "John Bevan", accountName: "", holdForLater: true },
  { key: "farhaz_mohammed", fullName: "Farhaz Mohammed", accountName: "", holdForLater: true },
  { key: "nathalie_jongma", fullName: "Nathalie Jongma", accountName: "", holdForLater: true },
  { key: "amanda_barnett", fullName: "Amanda Barnett", accountName: "", holdForLater: true },
  { key: "meriem_nazih", fullName: "Meriem Nazih", accountName: "", holdForLater: true },
  { key: "ahmed_dawlatly", fullName: "Ahmed Dawlatly", accountName: "", holdForLater: true },
  { key: "journey_feng", fullName: "Journey Feng", accountName: "", holdForLater: true },
];

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") || parts[0] };
}

async function findContactsByName(tx: Prisma.TransactionClient, fullName: string) {
  const target = normalizeName(fullName);
  const all = await tx.contact.findMany({ select: { id: true, firstName: true, lastName: true, accountId: true, title: true } });
  return all.filter((c) => normalizeName(`${c.firstName} ${c.lastName}`) === target);
}

// Leads created by this module are named "Full Name — Account Name" (same
// convention as the existing Sprint 03 Travelport lead). Matching on exact
// equality would never find a lead this module itself created, breaking
// idempotency — so a lead also matches when its normalized name starts with
// the normalized person name followed by a word boundary.
async function findLeadsByName(tx: Prisma.TransactionClient, fullName: string) {
  const target = normalizeName(fullName);
  const all = await tx.lead.findMany({ select: { id: true, name: true, accountId: true, status: true } });
  return all.filter((l) => {
    const n = normalizeName(l.name);
    return n === target || n.startsWith(`${target} `);
  });
}

async function findAccountByName(tx: Prisma.TransactionClient, accountName: string) {
  const target = normalizeName(accountName);
  const all = await tx.account.findMany({ select: { id: true, name: true } });
  return all.find((a) => normalizeName(a.name) === target) ?? null;
}

// ─── PREVIEW ─────────────────────────────────────────────────────────────

type PreviewRow = {
  key: string;
  fullName: string;
  accountName: string;
  existingAccount: { id: string; name: string } | null;
  existingContacts: { id: string; name: string }[];
  existingLeads: { id: string; name: string; status: string }[];
  action:
    | "CREATE"
    | "UPDATE"
    | "LINK"
    | "SKIP_ALREADY_EXISTS"
    | "REVIEW_CONFLICT"
    | "REPORT_ONLY"
    | "HOLD_FOR_LATER";
  relationshipStrength?: string;
  sourceType?: string;
  sourceDetail?: string;
  acquisitionPath?: string;
  leadStatus?: string;
  salesMotion?: string;
  opportunityLink?: string;
  taskProposed?: string;
  note?: string;
};

export async function previewImport() {
  const rows: PreviewRow[] = [];

  for (const p of PEOPLE) {
    const existingContacts = await findContactsByName(prisma as unknown as Prisma.TransactionClient, p.fullName);
    const existingLeads = await findLeadsByName(prisma as unknown as Prisma.TransactionClient, p.fullName);
    const existingAccount = p.accountName ? await findAccountByName(prisma as unknown as Prisma.TransactionClient, p.accountName) : null;

    let action: PreviewRow["action"];
    if (p.holdForLater) {
      action = existingContacts.length || existingLeads.length ? "REVIEW_CONFLICT" : "HOLD_FOR_LATER";
    } else if (p.existingCheckOnly) {
      action = "REPORT_ONLY";
    } else if (existingContacts.length > 1 || existingLeads.length > 1) {
      action = "REVIEW_CONFLICT";
    } else if (p.mustAlreadyExist) {
      action = existingContacts.length === 1 || existingLeads.length === 1 ? "UPDATE" : "REVIEW_CONFLICT";
    } else if (existingContacts.length === 1) {
      action = "UPDATE";
    } else if (p.opportunityKey && existingContacts.length === 0) {
      action = "CREATE";
    } else {
      action = "CREATE";
    }

    rows.push({
      key: p.key,
      fullName: p.fullName,
      accountName: p.accountName,
      existingAccount,
      existingContacts: existingContacts.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}` })),
      existingLeads: existingLeads.map((l) => ({ id: l.id, name: l.name, status: l.status })),
      action,
      relationshipStrength: p.relationshipStrength,
      sourceType: p.sourceType,
      sourceDetail: p.sourceDetail,
      acquisitionPath: p.acquisitionPath,
      leadStatus: p.leadStatus,
      salesMotion: p.salesMotion,
      opportunityLink: p.opportunityKey ? `Tourism 365 — PlacePulse destination intelligence (isPrimary=${p.isPrimaryStakeholder ?? false})` : undefined,
      taskProposed: p.taskTitle,
      note: p.note,
    });
  }

  const accountsToCreate = Array.from(
    new Set(
      PEOPLE.filter((p) => !p.holdForLater && !p.existingCheckOnly && p.accountName).map((p) => p.accountName)
    )
  );
  const accountPreview = await Promise.all(
    accountsToCreate.map(async (name) => {
      const existing = await findAccountByName(prisma as unknown as Prisma.TransactionClient, name);
      return { name, existing: existing ? { id: existing.id, name: existing.name } : null, willCreate: !existing };
    })
  );

  return {
    people: rows,
    accounts: accountPreview,
    activitiesToCreate: 0,
    summary: {
      create: rows.filter((r) => r.action === "CREATE").length,
      update: rows.filter((r) => r.action === "UPDATE").length,
      reviewConflict: rows.filter((r) => r.action === "REVIEW_CONFLICT").length,
      reportOnly: rows.filter((r) => r.action === "REPORT_ONLY").length,
      holdForLater: rows.filter((r) => r.action === "HOLD_FOR_LATER").length,
    },
  };
}

// ─── EXECUTE ─────────────────────────────────────────────────────────────

type StepReport = { step: string; status: "applied" | "already_applied" | "skipped"; detail: string };

async function getOrCreateAccount(tx: Prisma.TransactionClient, report: StepReport[], accountName: string): Promise<string | null> {
  const existing = await findAccountByName(tx, accountName);
  if (existing) return existing.id;
  const created = await tx.account.create({ data: { name: accountName } });
  report.push({ step: `Account — ${accountName}`, status: "applied", detail: `created (${created.id})` });
  return created.id;
}

export async function executeImport() {
  const report: StepReport[] = [];

  await prisma.$transaction(async (tx) => {
    // Resolve/create all accounts first (except hold-for-later / report-only people)
    const accountIdByName = new Map<string, string>();
    for (const p of PEOPLE) {
      if (p.holdForLater || p.existingCheckOnly || !p.accountName) continue;
      if (accountIdByName.has(p.accountName)) continue;
      const existing = await findAccountByName(tx, p.accountName);
      if (existing) {
        accountIdByName.set(p.accountName, existing.id);
      } else {
        const id = await getOrCreateAccount(tx, report, p.accountName);
        if (id) accountIdByName.set(p.accountName, id);
      }
    }

    // Track newly created contacts this run for referral linking (Yara -> Rebin)
    const contactIdByPersonKey = new Map<string, string>();

    for (const p of PEOPLE) {
      if (p.holdForLater) {
        const existingContacts = await findContactsByName(tx, p.fullName);
        const existingLeads = await findLeadsByName(tx, p.fullName);
        report.push({
          step: `Phase 7 — ${p.fullName}`,
          status: "skipped",
          detail:
            existingContacts.length || existingLeads.length
              ? `held for later, but a possible existing record was found (${existingContacts.length} contact(s), ${existingLeads.length} lead(s)) — flagged for review, not modified`
              : "held for later per Sprint 04 scope — no existing record found, nothing created",
        });
        continue;
      }

      if (p.existingCheckOnly) {
        const contact = p.key === "adrian_roodt" ? await tx.contact.findUnique({ where: { id: KNOWN_CONTACTS.adrianRoodt } }) : null;
        report.push({
          step: `${p.fullName}`,
          status: "skipped",
          detail: contact ? `read-only — current state: '${contact.firstName} ${contact.lastName}', untouched` : "read-only, not found",
        });
        continue;
      }

      const existingContacts = await findContactsByName(tx, p.fullName);
      const existingLeads = await findLeadsByName(tx, p.fullName);

      if (existingContacts.length > 1 || existingLeads.length > 1) {
        report.push({ step: `${p.fullName}`, status: "skipped", detail: `ambiguous — ${existingContacts.length} contact(s) / ${existingLeads.length} lead(s) match this name — not touched` });
        continue;
      }

      if (p.mustAlreadyExist && existingContacts.length === 0 && existingLeads.length === 0) {
        report.push({ step: `${p.fullName}`, status: "skipped", detail: "expected to already exist in production but no unique match found — not created, per Sprint 04 scope" });
        continue;
      }

      const accountId = p.accountName ? accountIdByName.get(p.accountName) ?? null : null;

      // mustAlreadyExist people: reconcile ONLY the record type that already
      // exists — never create a Contact (or a Lead) as a side effect just
      // because the other one exists. If only a Lead exists, update the
      // Lead's own provenance fields directly and stop; do not fall through
      // to contact creation below.
      if (p.mustAlreadyExist && existingContacts.length === 0 && existingLeads.length === 1) {
        const lead = existingLeads[0];
        const currentLead = await tx.lead.findUniqueOrThrow({ where: { id: lead.id } });
        const data: Prisma.LeadUncheckedUpdateInput = {};
        if (!currentLead.sourceType && p.sourceType) data.sourceType = p.sourceType;
        if (!currentLead.sourceDetail && p.sourceDetail) data.sourceDetail = p.sourceDetail;
        if (!currentLead.salesMotion && p.salesMotion) data.salesMotion = p.salesMotion;
        if (Object.keys(data).length > 0) {
          await tx.lead.update({ where: { id: lead.id }, data });
          report.push({ step: `Lead — ${p.fullName}`, status: "applied", detail: `reconciled provenance on existing lead ${lead.id} (${Object.keys(data).join(", ")}) — no Contact created, none existed` });
        } else {
          report.push({ step: `Lead — ${p.fullName}`, status: "already_applied", detail: `existing lead ${lead.id} already complete — no Contact created, none existed` });
        }
        continue;
      }

      // Contact: reuse if found, else create (mustAlreadyExist with no
      // Contact match was already routed to the Lead-only branch above).
      let contactId: string;
      if (existingContacts.length === 1) {
        contactId = existingContacts[0].id;
        const data: Prisma.ContactUpdateInput = {};
        // Only fill fields that are currently empty — never overwrite an existing value.
        if (p.title && !existingContacts[0].title) data.title = p.title;
        const current = await tx.contact.findUniqueOrThrow({ where: { id: contactId } });
        if (p.relationshipStrength && !current.relationshipStrength) data.relationshipStrength = p.relationshipStrength;
        if (p.sourceType && !current.sourceType) data.sourceType = p.sourceType;
        if (p.sourceDetail && !current.sourceDetail) data.sourceDetail = p.sourceDetail;
        if (p.acquisitionPath && !current.acquisitionPath) data.acquisitionPath = p.acquisitionPath;
        if (Object.keys(data).length > 0) {
          await tx.contact.update({ where: { id: contactId }, data });
          report.push({ step: `Contact — ${p.fullName}`, status: "applied", detail: `updated (${Object.keys(data).join(", ")}) on existing contact ${contactId}` });
        } else {
          report.push({ step: `Contact — ${p.fullName}`, status: "already_applied", detail: `existing contact ${contactId} already has these fields set — no change` });
        }
      } else {
        if (!accountId) {
          report.push({ step: `Contact — ${p.fullName}`, status: "skipped", detail: `no account resolved for '${p.accountName}' — not created` });
          continue;
        }
        const { firstName, lastName } = splitName(p.fullName);
        let referredById: string | undefined;
        if (p.referredByName) {
          const refs = await findContactsByName(tx, p.referredByName);
          if (refs.length === 1) referredById = refs[0].id;
        }
        const created = await tx.contact.create({
          data: {
            firstName,
            lastName,
            accountId,
            title: p.title ?? null,
            relationshipStrength: p.relationshipStrength ?? null,
            sourceType: p.sourceType ?? null,
            sourceDetail: p.sourceDetail ?? null,
            acquisitionPath: p.acquisitionPath ?? null,
            referredById,
          },
        });
        contactId = created.id;
        report.push({ step: `Contact — ${p.fullName}`, status: "applied", detail: `created (${contactId})${referredById ? `, referredBy=${p.referredByName}` : ""}` });
      }
      contactIdByPersonKey.set(p.key, contactId);

      // Lead (only if leadStatus specified — otherwise this person links directly to an Opportunity instead)
      if (p.leadStatus) {
        if (existingLeads.length === 1) {
          const lead = existingLeads[0];
          const data: Prisma.LeadUncheckedUpdateInput = {};
          if (!lead.accountId && accountId) data.accountId = accountId;
          const currentLead = await tx.lead.findUniqueOrThrow({ where: { id: lead.id } });
          if (!currentLead.primaryContactId) data.primaryContactId = contactId;
          if (!currentLead.sourceType && p.sourceType) data.sourceType = p.sourceType;
          if (!currentLead.sourceDetail && p.sourceDetail) data.sourceDetail = p.sourceDetail;
          if (!currentLead.salesMotion && p.salesMotion) data.salesMotion = p.salesMotion;
          if (Object.keys(data).length > 0) {
            await tx.lead.update({ where: { id: lead.id }, data });
            report.push({ step: `Lead — ${p.fullName}`, status: "applied", detail: `updated existing lead ${lead.id} (${Object.keys(data).join(", ")})` });
          } else {
            report.push({ step: `Lead — ${p.fullName}`, status: "already_applied", detail: `existing lead ${lead.id} already complete` });
          }
        } else if (accountId) {
          const created = await tx.lead.create({
            data: {
              name: `${p.fullName} — ${p.accountName}`,
              company: p.accountName,
              primaryProduct: "PLACEPULSE",
              accountId,
              primaryContactId: contactId,
              status: p.leadStatus,
              sourceType: p.sourceType ?? null,
              sourceDetail: p.sourceDetail ?? null,
              salesMotion: p.salesMotion ?? null,
            },
          });
          report.push({ step: `Lead — ${p.fullName}`, status: "applied", detail: `created (${created.id}), status=${p.leadStatus}` });
        }
      }

      // Opportunity stakeholder link
      if (p.opportunityKey) {
        const opportunityId = KNOWN_OPPORTUNITIES[p.opportunityKey];
        const existingLink = await tx.opportunityContact.findUnique({
          where: { opportunityId_contactId: { opportunityId, contactId } },
        });
        if (existingLink) {
          report.push({ step: `Opportunity link — ${p.fullName}`, status: "already_applied", detail: `already linked (isPrimary=${existingLink.isPrimary})` });
        } else {
          await tx.opportunityContact.create({ data: { opportunityId, contactId, isPrimary: p.isPrimaryStakeholder ?? false } });
          report.push({ step: `Opportunity link — ${p.fullName}`, status: "applied", detail: `linked to Tourism 365 opportunity, isPrimary=${p.isPrimaryStakeholder ?? false}` });
        }
      }

      // Task
      if (p.taskTitle) {
        const existingTask = await tx.task.findFirst({ where: { title: p.taskTitle, contactId } });
        if (existingTask) {
          report.push({ step: `Task — ${p.fullName}`, status: "already_applied", detail: `task already exists (${existingTask.id})` });
        } else {
          const created = await tx.task.create({
            data: {
              title: p.taskTitle,
              status: "OPEN",
              priority: "MEDIUM",
              product: "PLACEPULSE",
              contactId,
              accountId: accountId ?? undefined,
              dueDate: null,
            },
          });
          report.push({ step: `Task — ${p.fullName}`, status: "applied", detail: `created (${created.id}), no due date (none known)` });
        }
      }
    }
  });

  return report;
}
