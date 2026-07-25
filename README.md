# ArqOne CRM

One CRM, multiple ArqOne business lines — **PlacePulse**, **Plymio**, **AI Navigator**
and **ArqOne Advisory** — with product-aware records, filters, workspaces,
pipelines, tasks, accounts and reporting.

## Stack

- **Next.js 14** (App Router, TypeScript)
- **Prisma** ORM + **Postgres** (Supabase in production; any Postgres works locally)
- **Tailwind CSS** + **Lucide** icons
- Deployed on **Netlify** via the official Next.js runtime

## Getting Started (local development)

You need a Postgres database to point at — either a free [Supabase](https://supabase.com)
project (simplest: reuse it for local dev too) or a local Postgres instance.

```bash
# 1. Install dependencies
npm install

# 2. Configure the database
cp .env.example .env
# edit .env: set DATABASE_URL (and DIRECT_URL) to your Postgres connection string
# leave CRM_ACCESS_PASSWORD unset locally to skip the login prompt

# 3. Apply migrations
npx prisma migrate deploy

# 4. Seed with ArqOne sample data (idempotent — safe to re-run)
npm run db:seed

# 5. Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Safe local reset

```bash
npx prisma migrate reset   # drops and recreates the schema, then prompts to seed
```

The seed is idempotent: every record upserts against a deterministic identifier
(team members and contacts by email, accounts by name, everything else by fixed
ids), so running it twice never duplicates data.

## Deploying to production (Netlify + Supabase)

The repo is Netlify-ready (`netlify.toml` + `@netlify/plugin-nextjs`). To put
this live under a subdomain of `arqonelabs.com`:

1. **Create a Supabase project** at [supabase.com](https://supabase.com) (free tier
   is enough to start). In *Project Settings → Database → Connection string*,
   copy the **Transaction pooler** URL (port 6543) for `DATABASE_URL`, and the
   **direct connection** URL (port 5432) for `DIRECT_URL`.
2. **Apply migrations to Supabase once**, from your machine:
   ```bash
   DATABASE_URL="<transaction-pooler-url>" DIRECT_URL="<direct-url>" npx prisma migrate deploy
   DATABASE_URL="<transaction-pooler-url>" npm run db:seed   # optional, for sample data
   ```
3. **Create a new Netlify site** from this GitHub repo (branch:
   `claude/design-sales-crm-p7CKR`, or `main` once merged). Netlify auto-detects
   `netlify.toml`.
4. **Set environment variables** on the Netlify site (*Site configuration →
   Environment variables*):
   - `DATABASE_URL` — the same Supabase pooler URL from step 1
   - `DIRECT_URL` — the same Supabase direct URL from step 1
   - `CRM_ACCESS_PASSWORD` — a shared password gating the whole app (HTTP Basic
     Auth) until per-user login ships. **Do not deploy without this set** —
     without it the CRM is reachable by anyone with the URL.
5. **Deploy**, then add the subdomain: in Netlify *Domain management → Add
   domain alias*, add e.g. `crm.arqonelabs.com`. Netlify gives you a DNS
   target (usually a CNAME to `<sitename>.netlify.app`, or an A/ALIAS record
   if using it as the apex). Add that record at wherever `arqonelabs.com`'s
   DNS is managed. Netlify auto-provisions the SSL certificate once the DNS
   record resolves (can take a few minutes to a few hours to propagate).

After that, share `https://crm.arqonelabs.com` plus the access password with
teammates. Every push to the connected branch redeploys automatically.

### Access control note

The `CRM_ACCESS_PASSWORD` gate is a stopgap — one shared password for
everyone, not per-user accounts or roles. It exists so the CRM is never
publicly reachable with zero protection. Per-user Supabase Auth (see Roadmap)
replaces it with real login and enforces the Sales Director / Executive /
Viewer roles that already exist in the data model but aren't enforced yet.

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

- [x] Postgres/Supabase-ready schema + Netlify deployment
- [ ] Per-user Supabase Auth, replacing the shared-password gate, with
      Sales Director / Executive / Viewer roles enforced (not just stored)
- [ ] Make automations (lead scoring, follow-up reminders, weekly digest)
- [ ] AI sales assistant (email drafts, lead qualification, interaction summaries)
