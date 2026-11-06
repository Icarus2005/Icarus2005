# ArqOne CRM — Sprint 4B Codex handoff

**Purpose:** Give Codex one durable source-of-truth instruction file instead of repeated copy/paste between ChatGPT and Codex.

**Production-connected branch:** `claude/design-sales-crm-p7CKR`
**Approved starting commit:** `16ef8d986dfe80547b87f70967f61e9f1ed6903c`
**Status:** Implementation brief only. Nothing in this file authorizes a production deployment, migration, live mailbox access, credential change, automatic sending, or new recurring spend.

## Existing references (read before coding)

- `docs/SPRINT_4_EMAIL_READINESS_ASSESSMENT.md`
- `docs/SPRINT_4_EMAIL_IMPLEMENTATION_SPEC.md` (available on `docs/sprint-4-email-implementation-spec`; inspect it without merging stale base changes)
- `docs/SPRINT_4A_EMAIL_FOUNDATION.md`
- `src/lib/email/*`, Prisma models for `MailboxConnection`, `EmailThread`, `EmailMessage`, `EmailSyncCursor`
- Account/Contact Relationship Memory and canonical Activity/Task workflows.

## Goal

Build a **one-mailbox, read-only email intelligence** implementation in a dedicated feature branch, tested offline and previewed safely. Enable a future pilot to recognize genuine replies from existing business Contacts, display verified email metadata in relationship history, and support human-approved follow-up preparation. The pilot must not send emails or autonomously mutate commercial records.

## Scope

1. Create a provider-neutral read-only sync orchestration layer and a Zoho Mail reader adapter using mocked, redacted provider fixtures.
2. Only provider-verified metadata crosses the adapter: provider/account/message IDs, direction, sender/recipients, verified timestamps, thread/reply evidence, permitted subject (pending retention decision). No full body, snippets, attachments, raw headers or raw provider payloads are stored.
3. Match Contacts only by exact normalized email and derive Account through the confirmed Contact. Ambiguous, personal, shared/group, and unknown contacts remain unlinked/review-only. No fuzzy matching.
4. Confirm replies only through same-mailbox provider thread identifiers or RFC header/reply evidence. Preserve RFC Message-ID case. Never confirm a reply from subject/date/address similarity alone.
5. Add a **read-only** email correspondence view to Account and Contact Relationship Memory with source, direction, date and verification basis; avoid duplication with existing CRM-sent EMAIL Activities.
6. Add a read-only Email Sync Health view showing last verified sync, cursor freshness, counts of matched/unmatched/error records and connection-disabled state.
7. Prepare a **30-minute** scheduled reconciliation path with **30-day initial lookback**, bounded pages, rate limits, retry/backoff, idempotency, cursor-after-commit semantics and overlap. Do not enable the scheduler or any synchronization flag. A webhook can be proposed later but is out of scope.
8. Test with a disposable local PostgreSQL 18 database and mock HTTP provider responses: deduplication, replay, exact matching, ambiguous contacts, privacy, outage, pagination/cursor recovery, reply evidence, feature flag OFF path and legacy CRM regression.

## Boundaries

- **No** real Zoho mailbox connection, OAuth configuration, email send, bulk historical backfill, production CRM data mutation, or new paid service.
- **No** changes to shared authentication, Leads, Opportunities, canonical Tasks, client commitment dates, or existing outbound sending.
- All email feature flags remain false/unset; MailboxConnections disabled.
- No real provider API calls in CI.
- No migrations applied to production or production-linked preview database. If an additive schema is necessary to persist reviewed Contact/Account matches, propose the migration separately in the PR and wait for approval.
- Use a new isolated feature branch based on the stated production commit. Do not implement on this documentation handoff branch.
- Do not merge or deploy to production without explicit user approval.

## Delivery and verification

- Dedicated feature branch and **draft PR**.
- Protected Netlify deploy preview; explicitly verify it cannot migrate production-linked database and anonymous traffic receives 401.
- Complete database-backed regression, TypeScript, ESLint, Prisma validation, clean optimized production build and dependency audit.
- Screen captures for Account/Contact email history and Sync Health on desktop/mobile.
- Report implementation commits, changed files, QA, estimated ongoing API/function/storage cost and exact live-pilot approvals required (mailbox address/provider region, OAuth read scope, retention/privacy/deletion, scheduler budget, and any migration).
- If a new blocking design decision arises, document the options in the PR rather than guessing or enabling a live integration.

**Commercial operating principle:** automate observation, organization, and preparation; retain founder review/approval for every outbound message.
