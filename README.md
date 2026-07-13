# ArqOne CRM

One CRM, multiple ArqOne business lines — **PlacePulse**, **Plymio**, **AI Navigator**
and **ArqOne Advisory** — with product-aware records, filters, workspaces,
pipelines, tasks, accounts and reporting.

## Stack

- **Next.js 14** (App Router, TypeScript)
- **Prisma** ORM + **SQLite** (dev) — the Supabase migration will switch to Postgres
- **Tailwind CSS** + **Lucide** icons

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Apply migrations + create the local database
npx prisma migrate deploy

# 3. Seed with ArqOne sample data (idempotent — safe to re-run)
npm run db:seed

# 4. Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Safe local reset

```bash
npm run db:reset   # deletes prisma/dev.db, re-applies migrations, re-seeds
```

The seed is idempotent: every record upserts against a deterministic identifier
(team members and contacts by email, accounts by name, everything else by fixed
ids), so running it twice never duplicates data.

## Product model

- Canonical product keys stored in the database: `PLACEPULSE`, `PLYMIO`,
  `AI_NAVIGATOR`, `ADVISORY`, `UNASSIGNED`. Labels are display-only.
- **Leads** carry a required `primaryProduct` (owns the forecast) plus optional
  `secondaryProducts` for cross-sell interest, multi-market codes, sales motion,
  estimated value, and next action.
- **Opportunities** belong to exactly one product and sit on that product's own
  pipeline (`Pipeline` / `PipelineStage` tables with ordered stages and default
  probabilities). Converting a lead with secondary interests can create separate
  additional opportunities — never a combined one.
- **Accounts and contacts are shared** across products; account detail groups
  opportunities by product.
- **Tasks and activities inherit product context** from their linked
  opportunity or lead; an explicit product can be chosen only when linked to an
  account/contact alone.
- The persistent **product selector** filters every workspace via the
  `?product=KEY` query string — copied URLs reopen the same filtered view.
  `/workspace/<product>` opens a per-product sales workspace.

## Modules

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
| Settings | `/settings` | Workspace, Team, Products, Pipelines, Markets, Fields |

## Roadmap

- [ ] Supabase migration (Postgres + Auth with Sales Director / Executive / Viewer roles)
- [ ] Make automations (lead scoring, follow-up reminders, weekly digest)
- [ ] AI sales assistant (email drafts, lead qualification, interaction summaries)
