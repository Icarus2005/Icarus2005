# ArqOne CRM

Internal sales CRM for ArqOne Labs — leads, pipeline, client management, and sales tracking.

## Stack

- **Next.js 14** (App Router, TypeScript)
- **Prisma** ORM + **SQLite** (dev) — swap `DATABASE_URL` provider for Supabase Postgres in prod
- **Tailwind CSS**

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Set up the database (fresh install or after schema changes)
npx prisma migrate dev --name init

# 3. (Optional) Seed with sample data
npm run db:seed

# 4. Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Upgrading from an older version?** The v2 schema changed deal stages and added
> Leads/Tasks. Easiest path: delete `prisma/dev.db`, then re-run steps 2–3.

## Modules

| Page | Route | Notes |
|------|-------|-------|
| Dashboard | `/` | KPIs, pipeline by stage, win/loss by vertical, time-to-close, tasks |
| Leads | `/leads` | Status funnel (New → Contacted → Qualified), score, convert-to-deal |
| Pipeline | `/opportunities` | Kanban board + list, 7 stages |
| Accounts | `/accounts` | Companies with country/sector/vertical segmentation |
| Contacts | `/contacts` | People with roles, LinkedIn |
| Tasks | `/tasks` | Follow-ups with due dates, overdue highlighting |
| Activities | `/activities` | Meetings, calls, emails, demos, notes |
| Import CSV | `/import` | Bulk import incl. legacy pipeline-sheet format |

## Data Model

- **Lead** — pre-qualification prospect (status, score, product interest, digital maturity, source). Converts into Account + Contact + Opportunity.
- **Account** — company (country, sector, vertical, # locations, past engagements)
- **Contact** — person at an account (role, LinkedIn)
- **Opportunity** — deal: Identified → Qualified → Demo Scheduled → Proposal Sent → Negotiation → Closed Won/Lost. Product: MAYA, Metrics Pro, Consulting.
- **Task** — follow-up with due date, linked to lead/deal/account/contact
- **Activity** — logged interaction, linked to lead/account/contact/deal

## Roadmap (per project brief)

- [ ] Supabase migration (Postgres + Auth with Sales Director / Executive / Viewer roles)
- [ ] Make automations (lead scoring, follow-up reminders, weekly digest)
- [ ] AI sales assistant (email drafts, lead qualification, interaction summaries)

## Environment

```env
DATABASE_URL="file:./dev.db"
```
