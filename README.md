# Icarus CRM

Internal sales CRM for GCC mobility data & consulting.

## Stack

- **Next.js 14** (App Router, TypeScript)
- **Prisma** ORM + **SQLite** (dev) — swap `DATABASE_URL` for PostgreSQL in prod
- **Tailwind CSS**

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Set up the database
npx prisma migrate dev --name init

# 3. (Optional) Seed with sample data
npm run db:seed

# 4. Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Modules

| Page | Route |
|------|-------|
| Dashboard | `/` |
| Accounts | `/accounts` |
| Contacts | `/contacts` |
| Pipeline | `/opportunities` |
| Activities | `/activities` |

## Data Model

- **Account** — company (GCC country, sector, industry)
- **Contact** — person at an account (role: Decision Maker, Champion, etc.)
- **Opportunity** — deal linked to an account (Data Product or Consulting)
- **Activity** — meeting, call, email, demo, note (linked to account/contact/opportunity)

## Environment

Copy `.env.example` if needed. Default uses a local SQLite file at `prisma/dev.db`.

```env
DATABASE_URL="file:./dev.db"
```
