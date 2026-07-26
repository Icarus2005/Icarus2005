import { PrismaClient } from "@prisma/client";

/**
 * Seeds the proposal "binder": the service catalogue the writer selects from,
 * the document template, and brand guidance. Idempotent — upserts on a
 * deterministic id so re-running never duplicates entries.
 */
export async function seedProposalKnowledge(prisma: PrismaClient) {
  const entries: {
    id: string;
    kind: string;
    title: string;
    product: string | null;
    content: string;
  }[] = [
    {
      id: "kb_cat_placepulse",
      kind: "SERVICE_CATALOG",
      title: "PlacePulse service catalogue",
      product: "PLACEPULSE",
      content: `- **Location Intelligence Pilot** — footfall and dwell-time baseline for up to 3 sites, 8–10 weeks.
- **Catchment & Audience Study** — visitor origin, demographics and cross-visitation analysis.
- **Site Selection Assessment** — comparative scoring of candidate locations against demand signals.
- **OOH Audience Measurement** — impressions and exposure quality for out-of-home inventory.
- **Visitor Intelligence Programme** — recurring quarterly reporting with dashboard access.
- **Investment Due Diligence Brief** — location risk/opportunity assessment for an asset or portfolio.`,
    },
    {
      id: "kb_cat_plymio",
      kind: "SERVICE_CATALOG",
      title: "Plymio service catalogue",
      product: "PLYMIO",
      content: `- **Coaching Marketplace Pilot** — onboarding a coach cohort onto the platform, 6–12 weeks.
- **Executive Mentor Onboarding** — curation, vetting and enablement of a mentor panel.
- **Multilingual Coaching Subscription** — ongoing access across Arabic and English tracks.
- **Programme Design & Curriculum** — structured development pathway for a defined population.
- **Impact Measurement** — engagement and outcome reporting against agreed success criteria.`,
    },
    {
      id: "kb_cat_ai_navigator",
      kind: "SERVICE_CATALOG",
      title: "AI Navigator service catalogue",
      product: "AI_NAVIGATOR",
      content: `- **Executive AI Fluency Programme** — leadership cohort sessions, typically 4–8 weeks.
- **AI Use Case Prioritisation Workshop** — facilitated inventory and scoring of candidate use cases.
- **Enterprise Adoption Roadmap** — sequenced adoption plan with capability and governance milestones.
- **Team Enablement Track** — practitioner-level training for a nominated department.
- **Executive Briefing** — half-day orientation for a board or executive committee.`,
    },
    {
      id: "kb_cat_advisory",
      kind: "SERVICE_CATALOG",
      title: "ArqOne Advisory service catalogue",
      product: "ADVISORY",
      content: `- **AI Efficiency Audit** — process-level assessment of automation and augmentation opportunities.
- **AI Operating Model Blueprint** — target operating model, roles and ways of working.
- **AI Governance Framework** — policy, risk controls and review cadence.
- **Executive Workshop** — facilitated session on a defined strategic question.
- **Diagnostic Assessment** — current-state capability and readiness baseline.`,
    },
    {
      id: "kb_template_default",
      kind: "TEMPLATE",
      title: "ArqOne standard proposal structure",
      product: null,
      content: `# <Business line> Proposal — <Client>

## Executive Summary
Three to five sentences: the client's situation, what we propose, and the outcome.

## Understanding Your Requirements
Reflect the client's own words from the call. Demonstrate we listened.

## Proposed Approach
How we will deliver, phase by phase.

## Scope of Work
Explicit deliverables. Only the catalogue items actually discussed.

## Timeline
Indicative phases and durations. Mark unknowns [TIMELINE TO CONFIRM].

## Commercials
Indicative investment. Mark unknowns [PRICING TO CONFIRM].

## Next Steps
Three numbered actions, each with an owner.`,
    },
    {
      id: "kb_pricing_structure",
      kind: "SERVICE_CATALOG",
      title: "Pricing structure and rules",
      product: null,
      content: `**Rates are placeholders — set real figures before issuing any proposal.**

| SKU | Rate | Notes |
|---|---|---|
| Executive briefing (half-day) | [SET RATE] | Entry SKU — priced for access, not margin |
| Full-day workshop | [SET RATE] | |
| Multi-day engagement (per additional day) | [SET RATE] | |
| Programme (multi-week) | [SET RATE] | Quote as a programme fee, not a day count |
| Retainer / office hours | [SET MONTHLY RATE] | Land-and-expand after a first engagement |

Rules:
- Travel and accommodation are quoted **separately**, never absorbed into the headline fee.
- Quote in USD by default; AED or SAR where the client's procurement requires it.
- Price on outcome and access, not hours. A short high-value session is not "cheap because it is short".
- Always present three options; the middle one is the intended purchase.
- **Discount scope, never rate.** To reduce a price, remove a component and say which one.
  Never reduce the day rate — a rate quoted once becomes the rate expected forever.
- Early-stage discounts must be framed as time-boxed "founding client" terms in exchange for
  a reference or case study, so they do not set a permanent precedent.
- Every proposal states what is explicitly **out of scope** to prevent creep.`,
    },
    {
      id: "kb_brand_default",
      kind: "BRAND",
      title: "ArqOne brand and tone",
      product: null,
      content: `- Company: ArqOne Labs. Business lines: PlacePulse, Plymio, AI Navigator, ArqOne Advisory.
- Tone: confident, specific, plain. No hype, no superlatives, no "revolutionary" or "cutting-edge".
- Spelling: British English (organisation, programme, prioritisation).
- Currency: USD unless the client's market makes AED or SAR more natural.
- Always quantify where evidence exists; never fabricate metrics or named case studies.
- Close with a clear, low-friction next step.`,
    },
  ];

  for (const e of entries) {
    await prisma.proposalKnowledge.upsert({
      where: { id: e.id },
      update: { kind: e.kind, title: e.title, product: e.product, content: e.content },
      create: e,
    });
  }
}
