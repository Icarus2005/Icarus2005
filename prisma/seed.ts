/**
 * ArqOne CRM development seed.
 *
 * Idempotent by design: every record is upserted against a deterministic
 * identifier (team members by email, accounts by name, contacts by email,
 * everything else by fixed ids). Running the seed twice produces no
 * duplicates. `npm run db:reset` rebuilds the database from scratch.
 */
import { PrismaClient } from "@prisma/client";
import {
  PIPELINE_TEMPLATES,
  PRODUCTS_META,
  ALL_PRODUCT_KEYS,
  stageIdFor,
  pipelineTemplateFor,
  resolveStageKey,
} from "../src/lib/products";

const prisma = new PrismaClient();

function daysFromNow(days: number, hour = 10): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

// ─── Catalog ────────────────────────────────────────────────────────────────

async function seedCatalog() {
  for (let i = 0; i < ALL_PRODUCT_KEYS.length; i++) {
    const key = ALL_PRODUCT_KEYS[i];
    const meta = PRODUCTS_META[key];
    await prisma.product.upsert({
      where: { key },
      update: { name: meta.label, description: meta.description, displayOrder: i },
      create: {
        key,
        name: meta.label,
        description: meta.description,
        displayOrder: i,
        active: key !== "UNASSIGNED",
      },
    });
  }
  for (const t of PIPELINE_TEMPLATES) {
    await prisma.pipeline.upsert({
      where: { id: t.id },
      update: { name: t.name, productKey: t.productKey },
      create: { id: t.id, name: t.name, productKey: t.productKey },
    });
    for (let i = 0; i < t.stages.length; i++) {
      const s = t.stages[i];
      const id = stageIdFor(t.id, s.key);
      await prisma.pipelineStage.upsert({
        where: { id },
        update: {
          name: s.name,
          order: i,
          defaultProbability: s.probability,
          isWon: s.isWon ?? false,
          isLost: s.isLost ?? false,
        },
        create: {
          id,
          key: s.key,
          name: s.name,
          order: i,
          defaultProbability: s.probability,
          isWon: s.isWon ?? false,
          isLost: s.isLost ?? false,
          pipelineId: t.id,
        },
      });
    }
  }
}

// ─── Team ───────────────────────────────────────────────────────────────────

async function seedTeam() {
  const members = [
    { email: "pierosaleme@gmail.com", name: "Piero Saleme", role: "SALES_DIRECTOR" },
    { email: "sara@arqonelabs.com", name: "Sara Haddad", role: "SALES_EXECUTIVE" },
    { email: "omar@arqonelabs.com", name: "Omar Khalil", role: "SALES_EXECUTIVE" },
    { email: "dana@arqonelabs.com", name: "Dana Aboud", role: "SALES_EXECUTIVE" },
  ];
  const out: Record<string, string> = {};
  for (const m of members) {
    const rec = await prisma.teamMember.upsert({
      where: { email: m.email },
      update: { name: m.name, role: m.role },
      create: m,
    });
    out[m.email] = rec.id;
  }
  return out;
}

// ─── Accounts & contacts ────────────────────────────────────────────────────

type AccountSeed = {
  name: string;
  industry: string;
  country: string;
  sector: string;
  size: string;
  tier?: string;
  description: string;
  ownerEmail: string;
};

async function seedAccounts(team: Record<string, string>) {
  const accounts: AccountSeed[] = [
    // PlacePulse
    { name: "Emaar Malls", industry: "Retail Real Estate", country: "AE", sector: "PRIVATE", size: "ENTERPRISE", tier: "STRATEGIC", description: "Mall operator across Dubai", ownerEmail: "sara@arqonelabs.com" },
    { name: "Aldar Properties", industry: "Real Estate", country: "AE", sector: "PRIVATE", size: "ENTERPRISE", tier: "KEY", description: "Abu Dhabi destination developer (Yas Island)", ownerEmail: "sara@arqonelabs.com" },
    { name: "Gulf Sovereign Investment Office", industry: "Investment", country: "SA", sector: "SEMI_GOVERNMENT", size: "LARGE", tier: "STRATEGIC", description: "Regional investment office evaluating location assets", ownerEmail: "pierosaleme@gmail.com" },
    // Plymio
    { name: "Executive Coaching Network", industry: "Professional Development", country: "AE", sector: "PRIVATE", size: "MEDIUM", tier: "KEY", description: "Coaching network across the GCC", ownerEmail: "omar@arqonelabs.com" },
    { name: "Regional Leadership Academy", industry: "Education", country: "SA", sector: "SEMI_GOVERNMENT", size: "LARGE", tier: "KEY", description: "Leadership development academy", ownerEmail: "omar@arqonelabs.com" },
    { name: "Meridian Enterprise HR", industry: "Human Resources", country: "QA", sector: "PRIVATE", size: "LARGE", tier: "STANDARD", description: "Enterprise HR and talent team", ownerEmail: "omar@arqonelabs.com" },
    // AI Navigator
    { name: "Gulf National Bank", industry: "Banking", country: "KW", sector: "PRIVATE", size: "ENTERPRISE", tier: "STRATEGIC", description: "Regional bank building executive AI fluency", ownerEmail: "dana@arqonelabs.com" },
    { name: "Dubai Digital Authority", industry: "Government Technology", country: "AE", sector: "GOVERNMENT", size: "LARGE", tier: "STRATEGIC", description: "Government digital transformation entity", ownerEmail: "dana@arqonelabs.com" },
    { name: "Almarai Group", industry: "FMCG", country: "SA", sector: "PRIVATE", size: "ENTERPRISE", tier: "KEY", description: "Large enterprise exploring AI adoption at scale", ownerEmail: "dana@arqonelabs.com" },
    // Advisory
    { name: "GCC Retail Group", industry: "Retail", country: "AE", sector: "PRIVATE", size: "ENTERPRISE", tier: "KEY", description: "Multi-brand retail group across the GCC", ownerEmail: "pierosaleme@gmail.com" },
    { name: "Al Nowais Family Office", industry: "Investment", country: "AE", sector: "PRIVATE", size: "MEDIUM", tier: "STANDARD", description: "Family office reviewing AI operating model", ownerEmail: "pierosaleme@gmail.com" },
    { name: "Horizon Professional Services", industry: "Professional Services", country: "BH", sector: "PRIVATE", size: "LARGE", tier: "STANDARD", description: "Professional services firm", ownerEmail: "pierosaleme@gmail.com" },
  ];

  const ids: Record<string, string> = {};
  for (const a of accounts) {
    const rec = await prisma.account.upsert({
      where: { name: a.name },
      update: {
        industry: a.industry,
        country: a.country,
        sector: a.sector,
        size: a.size,
        tier: a.tier,
        description: a.description,
        ownerId: team[a.ownerEmail],
      },
      create: {
        name: a.name,
        industry: a.industry,
        country: a.country,
        sector: a.sector,
        size: a.size,
        tier: a.tier,
        description: a.description,
        ownerId: team[a.ownerEmail],
      },
    });
    ids[a.name] = rec.id;
  }
  return ids;
}

async function seedContacts(accounts: Record<string, string>) {
  const contacts = [
    { email: "layla@emaarmalls.com", firstName: "Layla", lastName: "Haddad", title: "Head of Insights", role: "CHAMPION", account: "Emaar Malls" },
    { email: "y.mansoori@aldar.com", firstName: "Yousef", lastName: "Al Mansoori", title: "Director, Destination Analytics", role: "DECISION_MAKER", account: "Aldar Properties" },
    { email: "invest@gsio.sa", firstName: "Reem", lastName: "Al Otaibi", title: "Head of Real Assets", role: "DECISION_MAKER", account: "Gulf Sovereign Investment Office" },
    { email: "marc@execoachnet.com", firstName: "Marc", lastName: "Dubois", title: "Managing Partner", role: "DECISION_MAKER", account: "Executive Coaching Network" },
    { email: "n.alharbi@rla.edu.sa", firstName: "Noura", lastName: "Al Harbi", title: "Programmes Director", role: "CHAMPION", account: "Regional Leadership Academy" },
    { email: "t.rahman@meridianhr.qa", firstName: "Tariq", lastName: "Rahman", title: "Chief People Officer", role: "DECISION_MAKER", account: "Meridian Enterprise HR" },
    { email: "f.alsabah@gnb.com.kw", firstName: "Fatima", lastName: "Al Sabah", title: "Chief Digital Officer", role: "DECISION_MAKER", account: "Gulf National Bank" },
    { email: "a.binrashid@dda.gov.ae", firstName: "Ahmed", lastName: "Bin Rashid", title: "Director of AI Enablement", role: "CHAMPION", account: "Dubai Digital Authority" },
    { email: "s.alqahtani@almarai.com", firstName: "Salman", lastName: "Al Qahtani", title: "VP Transformation", role: "INFLUENCER", account: "Almarai Group" },
    { email: "j.marsh@gccretail.com", firstName: "Julia", lastName: "Marsh", title: "COO", role: "DECISION_MAKER", account: "GCC Retail Group" },
    { email: "h.nowais@anfo.ae", firstName: "Hamad", lastName: "Al Nowais", title: "Principal", role: "DECISION_MAKER", account: "Al Nowais Family Office" },
    { email: "p.costa@horizonps.bh", firstName: "Paula", lastName: "Costa", title: "Head of Innovation", role: "CHAMPION", account: "Horizon Professional Services" },
  ];
  const ids: Record<string, string> = {};
  for (const c of contacts) {
    const rec = await prisma.contact.upsert({
      where: { email: c.email },
      update: { firstName: c.firstName, lastName: c.lastName, title: c.title, role: c.role, accountId: accounts[c.account] },
      create: { email: c.email, firstName: c.firstName, lastName: c.lastName, title: c.title, role: c.role, accountId: accounts[c.account] },
    });
    ids[c.email] = rec.id;
  }
  return ids;
}

// ─── Opportunities ──────────────────────────────────────────────────────────

type OppSeed = {
  id: string;
  name: string;
  product: string;
  stageKey: string;
  value: number;
  account: string;
  ownerEmail: string;
  markets: string;
  contactEmail?: string;
  forecastCategory?: string;
  healthStatus?: string;
  nextAction?: string;
  nextActionInDays?: number;
  expectedCloseInDays?: number;
  notes?: string;
  decisionMakerEngaged?: boolean;
};

async function seedOpportunities(
  team: Record<string, string>,
  accounts: Record<string, string>,
  contacts: Record<string, string>
) {
  const opps: OppSeed[] = [
    // PlacePulse
    { id: "opp_pp_dubai_mall_pilot", name: "Dubai Mall Location Intelligence Pilot", product: "PLACEPULSE", stageKey: "PILOT", value: 180000, account: "Emaar Malls", ownerEmail: "sara@arqonelabs.com", markets: "AE", contactEmail: "layla@emaarmalls.com", forecastCategory: "BEST_CASE", healthStatus: "ON_TRACK", nextAction: "Review pilot KPIs with insights team", nextActionInDays: 2, expectedCloseInDays: 45, decisionMakerEngaged: true, notes: "Pilot live across 3 flagship malls." },
    { id: "opp_pp_yas_island_review", name: "Yas Island Visitor Intelligence Review", product: "PLACEPULSE", stageKey: "DISCOVERY", value: 95000, account: "Aldar Properties", ownerEmail: "sara@arqonelabs.com", markets: "AE", contactEmail: "y.mansoori@aldar.com", nextAction: "Share discovery findings deck", nextActionInDays: 5, expectedCloseInDays: 75, notes: "Focus on weekend visitor flows." },
    { id: "opp_pp_invest_dd_brief", name: "Investment Location Due Diligence Brief", product: "PLACEPULSE", stageKey: "PROPOSAL", value: 140000, account: "Gulf Sovereign Investment Office", ownerEmail: "pierosaleme@gmail.com", markets: "SA,AE", contactEmail: "invest@gsio.sa", forecastCategory: "COMMIT", healthStatus: "AT_RISK", nextAction: "Follow up on proposal questions", nextActionInDays: -2, expectedCloseInDays: 30, decisionMakerEngaged: true, notes: "Two target districts in Riyadh, one in Dubai." },
    // Plymio
    { id: "opp_pl_marketplace_pilot", name: "AI Coaching Marketplace Pilot", product: "PLYMIO", stageKey: "PILOT", value: 60000, account: "Executive Coaching Network", ownerEmail: "omar@arqonelabs.com", markets: "AE", contactEmail: "marc@execoachnet.com", nextAction: "Confirm pilot cohort of 40 coaches", nextActionInDays: 1, expectedCloseInDays: 40, decisionMakerEngaged: true },
    { id: "opp_pl_mentor_onboarding", name: "Executive Mentor Onboarding Programme", product: "PLYMIO", stageKey: "QUALIFIED", value: 45000, account: "Regional Leadership Academy", ownerEmail: "omar@arqonelabs.com", markets: "SA", contactEmail: "n.alharbi@rla.edu.sa", nextAction: "Schedule discovery workshop", nextActionInDays: 7, expectedCloseInDays: 90 },
    { id: "opp_pl_multilingual_sub", name: "Multilingual Coaching Subscription", product: "PLYMIO", stageKey: "PROPOSAL", value: 85000, account: "Meridian Enterprise HR", ownerEmail: "omar@arqonelabs.com", markets: "QA", contactEmail: "t.rahman@meridianhr.qa", forecastCategory: "BEST_CASE", healthStatus: "STALLED", nextAction: "Re-engage CPO after budget review", nextActionInDays: -5, expectedCloseInDays: 25, notes: "Arabic + English coaching tracks." },
    // AI Navigator
    { id: "opp_an_exec_fluency", name: "Executive AI Fluency Programme", product: "AI_NAVIGATOR", stageKey: "PROGRAMME_DESIGN", value: 120000, account: "Gulf National Bank", ownerEmail: "dana@arqonelabs.com", markets: "KW", contactEmail: "f.alsabah@gnb.com.kw", forecastCategory: "COMMIT", nextAction: "Present programme design to ExCo", nextActionInDays: 3, expectedCloseInDays: 35, decisionMakerEngaged: true },
    { id: "opp_an_usecase_workshop", name: "AI Use Case Prioritisation Workshop", product: "AI_NAVIGATOR", stageKey: "USE_CASE_SCOPING", value: 55000, account: "Dubai Digital Authority", ownerEmail: "dana@arqonelabs.com", markets: "AE", contactEmail: "a.binrashid@dda.gov.ae", nextAction: "Collect use case inventory from departments", nextActionInDays: 4, expectedCloseInDays: 60 },
    { id: "opp_an_adoption_roadmap", name: "Enterprise AI Adoption Roadmap", product: "AI_NAVIGATOR", stageKey: "PROPOSAL", value: 150000, account: "Almarai Group", ownerEmail: "dana@arqonelabs.com", markets: "SA", contactEmail: "s.alqahtani@almarai.com", forecastCategory: "BEST_CASE", nextAction: "Align roadmap scope with VP Transformation", nextActionInDays: 6, expectedCloseInDays: 50 },
    // Advisory
    { id: "opp_ad_efficiency_audit", name: "AI Efficiency Audit", product: "ADVISORY", stageKey: "WORKSHOP_AUDIT", value: 70000, account: "GCC Retail Group", ownerEmail: "pierosaleme@gmail.com", markets: "AE,SA", contactEmail: "j.marsh@gccretail.com", forecastCategory: "COMMIT", nextAction: "Run audit readout with COO", nextActionInDays: 2, expectedCloseInDays: 20, decisionMakerEngaged: true },
    { id: "opp_ad_operating_model", name: "AI Operating Model Blueprint", product: "ADVISORY", stageKey: "DIAGNOSTIC_SCOPED", value: 90000, account: "Al Nowais Family Office", ownerEmail: "pierosaleme@gmail.com", markets: "AE", contactEmail: "h.nowais@anfo.ae", nextAction: "Finalise diagnostic scope", nextActionInDays: 8, expectedCloseInDays: 70 },
    { id: "opp_ad_governance_workshop", name: "AI Governance Executive Workshop", product: "ADVISORY", stageKey: "PROPOSAL", value: 40000, account: "Horizon Professional Services", ownerEmail: "pierosaleme@gmail.com", markets: "BH", contactEmail: "p.costa@horizonps.bh", nextAction: "Send workshop agenda options", nextActionInDays: 1, expectedCloseInDays: 30 },
    // Cross-product coverage on a shared account (Emaar has PlacePulse + Advisory)
    { id: "opp_ad_emaar_workshop", name: "AI Efficiency Workshop", product: "ADVISORY", stageKey: "DISCOVERY", value: 35000, account: "Emaar Malls", ownerEmail: "pierosaleme@gmail.com", markets: "AE", contactEmail: "layla@emaarmalls.com", nextAction: "Scope workshop participants", nextActionInDays: 9, expectedCloseInDays: 55, notes: "Cross-sell from the PlacePulse pilot relationship." },
  ];

  for (const o of opps) {
    const template = pipelineTemplateFor(o.product);
    const stageKey = resolveStageKey(template, o.stageKey);
    const stage = template.stages.find((s) => s.key === stageKey)!;
    const stageId = stageIdFor(template.id, stageKey);
    const data = {
      name: o.name,
      product: o.product,
      pipelineId: template.id,
      stageId,
      stage: stageKey,
      value: o.value,
      probability: stage.probability,
      markets: o.markets,
      forecastCategory: o.forecastCategory ?? "PIPELINE",
      healthStatus: o.healthStatus ?? "ON_TRACK",
      nextAction: o.nextAction ?? null,
      nextActionDate: o.nextActionInDays != null ? daysFromNow(o.nextActionInDays) : null,
      expectedCloseDate: o.expectedCloseInDays != null ? daysFromNow(o.expectedCloseInDays) : null,
      decisionMakerEngaged: o.decisionMakerEngaged ?? false,
      notes: o.notes ?? null,
      ownerId: team[o.ownerEmail],
      accountId: accounts[o.account],
    };
    await prisma.opportunity.upsert({ where: { id: o.id }, update: data, create: { id: o.id, ...data } });
    if (o.contactEmail && contacts[o.contactEmail]) {
      await prisma.opportunityContact.upsert({
        where: { opportunityId_contactId: { opportunityId: o.id, contactId: contacts[o.contactEmail] } },
        update: {},
        create: { opportunityId: o.id, contactId: contacts[o.contactEmail] },
      });
    }
  }
}

// ─── Leads ──────────────────────────────────────────────────────────────────

async function seedLeads(team: Record<string, string>) {
  const leads = [
    { id: "lead_pp_majid", name: "Rania Majid", company: "Majid Al Futtaim", title: "Director of Analytics", email: "rania.majid@maf.ae", markets: "AE,SA", sector: "Retail", primaryProduct: "PLACEPULSE", secondaryProducts: "ADVISORY", salesMotion: "EVENT", source: "EVENT", status: "CONTACTED", score: 82, estimatedValue: 160000, ownerEmail: "sara@arqonelabs.com", nextAction: "Send PlacePulse mall benchmark teaser", nextActionInDays: 1, notes: "Met at retail analytics summit. Interested in footfall intelligence; also asked about AI efficiency advisory." },
    { id: "lead_pp_redsea", name: "Khalid Anazi", company: "Red Sea Global", title: "Head of Destination Insights", email: "k.anazi@redseaglobal.sa", markets: "SA", sector: "Tourism", primaryProduct: "PLACEPULSE", salesMotion: "OUTBOUND", source: "OUTBOUND", status: "NEW", score: 61, estimatedValue: 120000, ownerEmail: "sara@arqonelabs.com", nextAction: "Intro call", nextActionInDays: 3 },
    { id: "lead_pl_coachhub", name: "Elena Petrova", company: "GrowthPath Coaching", title: "Founder", email: "elena@growthpath.co", markets: "AE", sector: "Professional Development", primaryProduct: "PLYMIO", salesMotion: "INBOUND", source: "INBOUND", status: "QUALIFIED", score: 74, estimatedValue: 50000, ownerEmail: "omar@arqonelabs.com", nextAction: "Demo of coach marketplace", nextActionInDays: 2 },
    { id: "lead_an_ministry", name: "Saeed Al Marri", company: "Ministry of Economy", title: "Digital Transformation Lead", email: "s.almarri@moec.gov.ae", markets: "AE", sector: "Government", primaryProduct: "AI_NAVIGATOR", secondaryProducts: "ADVISORY", salesMotion: "REFERRAL", source: "REFERRAL", status: "CONTACTED", score: 68, estimatedValue: 95000, ownerEmail: "dana@arqonelabs.com", nextAction: "Share executive programme outline", nextActionInDays: 4 },
    { id: "lead_ad_familyco", name: "Miriam Farah", company: "Farah Holdings", title: "Chief of Staff", email: "m.farah@farahholdings.com", markets: "AE,QA", sector: "Investment", primaryProduct: "ADVISORY", salesMotion: "EXISTING_RELATIONSHIP", source: "REFERRAL", status: "NEW", score: 57, estimatedValue: 65000, ownerEmail: "pierosaleme@gmail.com", nextAction: "Coffee meeting to scope audit", nextActionInDays: 6 },
    { id: "lead_un_inbound", name: "Jonas Weber", company: "Falcon Ventures", title: "Operating Partner", email: "jonas@falconventures.io", markets: "AE", sector: "Investment", primaryProduct: "UNASSIGNED", salesMotion: "INBOUND", source: "INBOUND", status: "NEW", score: 40, ownerEmail: "pierosaleme@gmail.com", notes: "Inbound via website — needs qualification to a business line." },
  ];
  for (const l of leads) {
    const data = {
      name: l.name,
      company: l.company,
      title: l.title,
      email: l.email,
      markets: l.markets,
      sector: l.sector,
      primaryProduct: l.primaryProduct,
      secondaryProducts: l.secondaryProducts ?? null,
      salesMotion: l.salesMotion,
      source: l.source,
      status: l.status,
      score: l.score,
      estimatedValue: l.estimatedValue ?? null,
      nextAction: l.nextAction ?? null,
      nextActionDate: l.nextActionInDays != null ? daysFromNow(l.nextActionInDays) : null,
      lastActivityAt: daysFromNow(-3),
      notes: l.notes ?? null,
      ownerId: team[l.ownerEmail],
    };
    await prisma.lead.upsert({ where: { id: l.id }, update: data, create: { id: l.id, ...data } });
  }
}

// ─── Tasks & activities ─────────────────────────────────────────────────────

async function seedTasksAndActivities(
  team: Record<string, string>,
  accounts: Record<string, string>,
  contacts: Record<string, string>
) {
  const tasks = [
    { id: "task_pp_pilot_kpis", title: "Prepare Dubai Mall pilot KPI review", dueInDays: -1, priority: "HIGH", opportunityId: "opp_pp_dubai_mall_pilot", accountId: accounts["Emaar Malls"], ownerEmail: "sara@arqonelabs.com" },
    { id: "task_pp_gsio_followup", title: "Chase GSIO proposal feedback", dueInDays: 0, priority: "URGENT", opportunityId: "opp_pp_invest_dd_brief", accountId: accounts["Gulf Sovereign Investment Office"], ownerEmail: "pierosaleme@gmail.com" },
    { id: "task_pl_cohort", title: "Confirm Plymio pilot coach cohort", dueInDays: 1, priority: "HIGH", opportunityId: "opp_pl_marketplace_pilot", accountId: accounts["Executive Coaching Network"], ownerEmail: "omar@arqonelabs.com" },
    { id: "task_an_exco_deck", title: "Finalise ExCo programme design deck", dueInDays: 2, priority: "HIGH", opportunityId: "opp_an_exec_fluency", accountId: accounts["Gulf National Bank"], ownerEmail: "dana@arqonelabs.com" },
    { id: "task_ad_audit_readout", title: "Draft AI Efficiency Audit readout", dueInDays: 3, priority: "MEDIUM", opportunityId: "opp_ad_efficiency_audit", accountId: accounts["GCC Retail Group"], ownerEmail: "pierosaleme@gmail.com" },
    { id: "task_lead_majid", title: "Send mall benchmark teaser to Rania", dueInDays: 1, priority: "MEDIUM", leadId: "lead_pp_majid", ownerEmail: "sara@arqonelabs.com" },
    // Account-only task with an explicit product (no lead/opportunity context)
    { id: "task_acc_aldar_qbr", title: "Prepare Aldar quarterly business review", dueInDays: 9, priority: "LOW", accountId: accounts["Aldar Properties"], product: "PLACEPULSE", ownerEmail: "sara@arqonelabs.com" },
    { id: "task_done_example", title: "Log GITEX follow-ups", dueInDays: -7, priority: "LOW", status: "DONE", ownerEmail: "pierosaleme@gmail.com" },
  ];
  for (const t of tasks) {
    const data = {
      title: t.title,
      dueDate: daysFromNow(t.dueInDays, 17),
      status: t.status ?? "OPEN",
      priority: t.priority,
      product: t.product ?? null,
      leadId: t.leadId ?? null,
      accountId: t.accountId ?? null,
      opportunityId: t.opportunityId ?? null,
      ownerId: team[t.ownerEmail],
    };
    await prisma.task.upsert({ where: { id: t.id }, update: data, create: { id: t.id, ...data } });
  }

  const activities = [
    { id: "act_pp_pilot_meeting", type: "MEETING", subject: "Pilot midpoint review with Emaar insights team", daysAgo: 2, opportunityId: "opp_pp_dubai_mall_pilot", accountId: accounts["Emaar Malls"], contactEmail: "layla@emaarmalls.com", ownerEmail: "sara@arqonelabs.com", notes: "Dwell-time uplift resonating; extend to Fashion Avenue." },
    { id: "act_pp_gsio_call", type: "CALL", subject: "Proposal clarification call with GSIO", daysAgo: 4, opportunityId: "opp_pp_invest_dd_brief", accountId: accounts["Gulf Sovereign Investment Office"], contactEmail: "invest@gsio.sa", ownerEmail: "pierosaleme@gmail.com" },
    { id: "act_pl_demo", type: "DEMO", subject: "Marketplace demo for coaching partners", daysAgo: 3, opportunityId: "opp_pl_marketplace_pilot", accountId: accounts["Executive Coaching Network"], contactEmail: "marc@execoachnet.com", ownerEmail: "omar@arqonelabs.com" },
    { id: "act_an_workshop", type: "MEETING", subject: "Use case scoping session with DDA departments", daysAgo: 1, opportunityId: "opp_an_usecase_workshop", accountId: accounts["Dubai Digital Authority"], contactEmail: "a.binrashid@dda.gov.ae", ownerEmail: "dana@arqonelabs.com" },
    { id: "act_ad_audit_kickoff", type: "MEETING", subject: "AI Efficiency Audit kickoff", daysAgo: 5, opportunityId: "opp_ad_efficiency_audit", accountId: accounts["GCC Retail Group"], contactEmail: "j.marsh@gccretail.com", ownerEmail: "pierosaleme@gmail.com" },
    { id: "act_lead_majid_email", type: "EMAIL", subject: "Followed up with Rania post-summit", daysAgo: 3, leadId: "lead_pp_majid", ownerEmail: "sara@arqonelabs.com" },
    // Account-only activity with explicit product
    { id: "act_acc_aldar_note", type: "NOTE", subject: "Aldar exploring Yas Bay expansion — PlacePulse relevance", daysAgo: 6, accountId: accounts["Aldar Properties"], product: "PLACEPULSE", ownerEmail: "sara@arqonelabs.com" },
  ];
  for (const a of activities) {
    const data = {
      type: a.type,
      subject: a.subject,
      notes: a.notes ?? null,
      date: daysFromNow(-a.daysAgo, 14),
      product: a.product ?? null,
      leadId: a.leadId ?? null,
      accountId: a.accountId ?? null,
      contactId: a.contactEmail ? contacts[a.contactEmail] : null,
      opportunityId: a.opportunityId ?? null,
      ownerId: team[a.ownerEmail],
    };
    await prisma.activity.upsert({ where: { id: a.id }, update: data, create: { id: a.id, ...data } });
  }
}

// Backfill any legacy opportunities missing pipeline/stage links (e.g. rows
// migrated from the pre-pipeline schema).
async function backfillPipelines() {
  const orphans = await prisma.opportunity.findMany({ where: { pipelineId: null } });
  for (const o of orphans) {
    const template = pipelineTemplateFor(o.product);
    const stageKey = resolveStageKey(template, o.stage);
    await prisma.opportunity.update({
      where: { id: o.id },
      data: { pipelineId: template.id, stageId: stageIdFor(template.id, stageKey), stage: stageKey },
    });
  }
  if (orphans.length) console.log(`Backfilled ${orphans.length} opportunities onto product pipelines.`);
}

async function main() {
  await seedCatalog();
  const team = await seedTeam();
  const accounts = await seedAccounts(team);
  const contacts = await seedContacts(accounts);
  await seedOpportunities(team, accounts, contacts);
  await seedLeads(team);
  await seedTasksAndActivities(team, accounts, contacts);
  await backfillPipelines();
  console.log("ArqOne seed complete (idempotent — safe to re-run).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
