# ArqOne CRM — Canonical Repository

> **This is the canonical ArqOne CRM repository.** It lives at
> `github.com/Icarus2005/Icarus2005` and is deployed independently (Netlify +
> Postgres/Netlify DB). It is **not** part of the ArqOne Labs parent monorepo
> and should not be confused with any older/obsolete CRM code that may exist
> under a parent portfolio workspace — this repo supersedes it.

Primary branch in active use: `claude/design-sales-crm-p7CKR` (tracks
`origin/claude/design-sales-crm-p7CKR`; will move to `main` once merged).

## What this is

A single CRM shared across ArqOne's business lines, with product-aware
records rather than separate CRM instances per product. Product-aware means:
leads/opportunities carry an explicit product key, pipelines are per-product,
and accounts/contacts/tasks/activities are shared across products but keep
product context.

**Important:** the product taxonomy in this CRM's data model is its own and
does **not** map 1:1 to the ArqOne Labs portfolio's platform list. Canonical
product keys stored in the database are:

- `PLACEPULSE`
- `PLYMIO`
- `AI_NAVIGATOR`
- `ADVISORY`
- `UNASSIGNED`

Do not assume BrandSprk / ShieldPilot / SalesX / TWIIN map into this schema —
they don't currently exist as product keys here.

## Stack

- **Next.js 14** (App Router, TypeScript)
- **Prisma** ORM + **Postgres** (Netlify DB / Neon in production; any
  Postgres works locally, incl. Supabase)
- **Tailwind CSS** + **Lucide** icons
- Deployed on **Netlify** via the official Next.js runtime (`netlify.toml`)

## Architecture

### Data model (`prisma/schema.prisma`)

- **Product catalog & pipelines**: `Product` → `Pipeline` (one default
  pipeline per product, deterministic id `pl_<product-key-lower>`) →
  `PipelineStage` (ordered, deterministic id `st_<pipeline>_<stage-key-lower>`,
  carries default win probability, `isWon`/`isLost` flags).
- **Leads**: required `primaryProduct` (owns forecast) + optional
  `secondaryProducts` for cross-sell. Converting a lead with secondary
  interest can spawn multiple opportunities — never a combined one.
- **Opportunities**: belong to exactly one product/pipeline.
- **Accounts & Contacts**: shared across products.
- **Tasks & Activities**: inherit product context from their linked
  opportunity/lead, or take an explicit product when linked only to an
  account/contact.
- **SavedView**: persists a list page's filter/query string for reopening.
- **Proposal pipeline** (meeting → triage → proposal → CRM), added later:
  - `MeetingTranscript` — captured call transcript (Fathom/Fireflies/manual),
    cheaply triaged (`triageStatus`, `triageScore`) before expensive
    generation runs.
  - `Proposal` — moves through `QUEUED → ANALYZING → RESEARCHING → DRAFTING →
    FORMATTING → REVIEW → APPROVED → DELIVERED → ARCHIVED`, with one stored
    artifact per pipeline skill (`requirements`, `research`, `draftContent`,
    `formatted`). `quotedPricing` (what was actually said on the call)
    overrides catalogue rates. `emailDraft` is never auto-sent.
  - `ProposalEvent` — audit trail of stage transitions.
- A **Knowledge** model/API (`/api/knowledge`) backs an editable proposal
  binder used by the generation pipeline, editable from Settings → Knowledge.

### App structure (`src/app`)

App Router pages mirror the modules table below; each has a matching
`api/<resource>` route group (list/detail/bulk/import/export as applicable).
Notable non-CRUD routes: `api/meetings/ingest` (transcript intake),
`api/proposals` (generation pipeline), `api/search` (global search),
`api/dashboard` (KPI aggregation).

`src/lib/proposals/` holds the proposal-generation pipeline logic
(transcript analysis → client research → drafting → formatting).

### Modules

| Page | Route | Notes |
|------|-------|-------|
| Dashboard | `/` | KPIs, pipeline by stage/product/owner, overdue tasks, deals at risk |
| Leads | `/leads` | Product badges, bulk assignment, unassigned queue, sales motion |
| Pipeline | `/opportunities` | Per-product stage boards + list, weighted totals, health |
| Product workspaces | `/workspace/[product]` | Overview, leads, pipeline, accounts, tasks, activities |
| Accounts | `/accounts` | Shared accounts with product coverage and pipeline totals |
| Contacts | `/contacts` | Shared people with product relationships |
| Tasks | `/tasks` | Grouped by due bucket, product-aware |
| Activities | `/activities` | Product/owner/account/date filters |
| Import CSV | `/import` | Accounts, contacts, leads, opportunities with product validation |
| Meetings | `/meetings` | Transcript intake + triage for the proposal pipeline |
| Proposals | `/proposals` | Generated proposals moving through the pipeline stages |
| Settings | `/settings` | Workspace, Team, Products, Pipelines, Markets, Fields, Knowledge |

The persistent product selector filters every workspace via `?product=KEY`;
`/workspace/<product>` opens a per-product sales workspace.

## Auth / access control

`CRM_ACCESS_PASSWORD` gates the whole app via HTTP Basic Auth — a stopgap,
not per-user accounts. Sales Director / Executive / Viewer roles exist in the
data model but are **not yet enforced**. Do not deploy without this password
set in production.

## Deployment

Netlify (`@netlify/plugin-nextjs`) + Postgres via `DATABASE_URL` (pooled) /
`DIRECT_URL` (unpooled). Any Postgres host works — the app only reads those
two env vars, so it isn't hard-wired to Netlify DB (Supabase and others work
too). See `README.md` for the full deploy walkthrough.

## Commands

```bash
npm run dev          # local dev server
npm run build         # prisma generate && next build
npm run db:migrate    # prisma migrate dev
npm run db:seed       # idempotent sample-data seed (upserts, safe to re-run)
npm run db:studio     # prisma studio
npm run db:reset      # drop/recreate schema + reseed
```

## Roadmap (from README)

- [ ] Per-user auth replacing the shared-password gate, enforcing the roles
      already in the schema
- [ ] Make.com automations (lead scoring, follow-up reminders, weekly digest)
- [ ] AI sales assistant (email drafts, lead qualification, interaction
      summaries)
