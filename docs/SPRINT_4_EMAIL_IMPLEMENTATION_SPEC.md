# Sprint 4 — Provider-Neutral Email Implementation Specification

**Status:** Specification only

**Production baseline:** `7b391e401ee7621e38e139fd30e087e356701172`

**Source assessment:** [Sprint 4 Email Readiness Assessment](./SPRINT_4_EMAIL_READINESS_ASSESSMENT.md)

This document defines an implementation sequence; it does not authorize a database migration, mailbox connection, retention policy, or new outbound capability. Those items are explicit approval gates below.

## 1. Outcome

Deliver a reliable, read-first relationship-email capability that can:

- discover inbound and outbound correspondence from one configured mailbox;
- verify provider events before treating them as CRM truth;
- match messages conservatively to existing Contacts and Accounts;
- identify replies using thread/header evidence;
- show verified correspondence in relationship history without changing commercial state;
- remain portable from Zoho to Microsoft Graph, Gmail or another provider.

The first release is a one-mailbox, metadata-first, read-only pilot. Existing approval-gated Zoho sending remains unchanged until outbound hardening is separately approved.

## 2. Non-goals for the first release

- No automatic Contact, Lead, Opportunity, Task or commitment creation.
- No automatic Lead qualification, Opportunity-stage changes or Task completion.
- No attachment ingestion.
- No private WhatsApp, Outlook desktop or unrelated mailbox import.
- No bulk historical backfill by default.
- No full-body retention until a retention policy is approved.
- No additional sending, auto-replies, sequences, campaigns or background follow-ups.
- No authentication redesign in this implementation unless separately authorized.

## 3. Architecture decision

```text
Zoho webhook ──► authenticated receipt ──► provider re-fetch ──► normalized EmailMessage
      │                                                        │
      └──────── wake-up only                                   ├─► exact Contact/Account link
Scheduled reconciliation ──► provider cursor/search ───────────┤
                                                               └─► read-only relationship timeline
```

Core decisions:

1. Webhooks are hints, not authoritative content.
2. Provider APIs are authoritative for message metadata and headers.
3. Sync idempotency is based on mailbox plus provider message ID.
4. Provider-specific shapes stop at an adapter boundary.
5. Contact matching is exact-email-only; ambiguity remains review-only.
6. Relationship timelines read normalized email records without rewriting old Activities.
7. Current `EMAIL` Activities remain valid historical records.

## 4. Provider interfaces

Retain the existing outbound `EmailProvider` and introduce a separate read interface:

```ts
type MailboxCursor = {
  receivedBefore?: string;
  overlapFrom?: string;
  pageToken?: string;
};

type NormalizedMailboxMessage = {
  provider: "ZOHO" | "MICROSOFT" | "GOOGLE" | "OTHER";
  providerAccountKey: string;
  externalMessageId: string;
  providerThreadId: string | null;
  internetMessageId: string | null;
  inReplyTo: string | null;
  references: string[];
  direction: "INBOUND" | "OUTBOUND";
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  snippet: string | null;
  sentAt: Date;
  receivedAt: Date | null;
  folderKey: string | null;
};

interface MailboxReader {
  listMessages(cursor: MailboxCursor): Promise<{
    messages: NormalizedMailboxMessage[];
    nextCursor: MailboxCursor | null;
  }>;
  getMessage(externalMessageId: string): Promise<NormalizedMailboxMessage>;
}
```

The Zoho adapter owns regional endpoints, OAuth token refresh, rate limiting and Zoho response mapping. CRM services must not import Zoho response types.

## 5. Proposed provider-neutral data model

This is an additive migration proposal. It requires separate approval before implementation.

### `MailboxConnection`

| Field | Purpose |
| --- | --- |
| `id` | Internal identifier. |
| `provider` | `ZOHO`, `MICROSOFT`, `GOOGLE`, `OTHER`. |
| `providerAccountKey` | Provider mailbox/account identifier. |
| `emailAddress` | Configured mailbox address. |
| `dataRegion` | Provider data-center/region key. |
| `enabled` | Master sync kill switch. |
| `secretReference` | Reference to deployment secret; never a raw refresh token. |
| `createdAt`, `updatedAt` | Audit timestamps. |

Unique constraint: `(provider, providerAccountKey)`.

For the one-mailbox pilot, secrets should remain in Netlify environment variables. `secretReference` identifies configuration only.

### `EmailThread`

| Field | Purpose |
| --- | --- |
| `id` | Internal identifier. |
| `mailboxConnectionId` | Mailbox scope. |
| `providerThreadId` | Provider-scoped thread identifier when available. |
| `subjectKey` | Normalized display/search aid; never sole reply evidence. |
| `latestMessageAt` | Ordering and cooling indicators. |

Unique constraint when populated: `(mailboxConnectionId, providerThreadId)`.

### `EmailMessage`

| Field | Purpose |
| --- | --- |
| `id` | Internal identifier. |
| `mailboxConnectionId` | Provider account scope. |
| `threadId` | Optional normalized thread relation. |
| `externalMessageId` | Provider message ID. |
| `internetMessageId` | RFC `Message-ID` when available. |
| `inReplyTo` | RFC reply reference. |
| `referencesJson` | Ordered RFC reference IDs. |
| `direction` | `INBOUND` or `OUTBOUND`. |
| `fromAddress` | Normalized sender address. |
| `toJson`, `ccJson` | Normalized recipient arrays. |
| `subject` | Provider-verified subject. |
| `snippet` | Bounded plain-text preview if policy permits. |
| `bodyText` | Nullable and disabled for metadata-first pilot. |
| `providerSentAt`, `providerReceivedAt` | Provider event times. |
| `folderKey` | Inbox/Sent/provider folder reference. |
| `syncState` | `VERIFIED`, `REVIEW`, `ERROR`, `TOMBSTONED`. |
| `rawPayloadHash` | Diagnostic integrity hash; not the raw payload. |
| `createdAt`, `updatedAt` | CRM persistence timestamps. |

Unique constraint: `(mailboxConnectionId, externalMessageId)`.

Indexes: `internetMessageId`, `threadId`, `fromAddress`, `providerReceivedAt`, `syncState`.

### `EmailEntityLink`

| Field | Purpose |
| --- | --- |
| `emailMessageId` | Linked message. |
| `entityType` | `ACCOUNT`, `CONTACT`, `LEAD`, `OPPORTUNITY`. |
| `entityId` | Existing CRM identifier. |
| `matchBasis` | `EXACT_CONTACT_EMAIL`, `CONFIRMED_THREAD`, `MANUAL`. |
| `reviewState` | `CONFIRMED`, `REVIEW_REQUIRED`, `REJECTED`. |
| `confirmedAt` | Confirmation timestamp. |

Primary key: `(emailMessageId, entityType, entityId)`.

No AI confidence score is a source of truth. Ambiguous matches remain review-only.

### `EmailSyncCursor`

Stores mailbox/folder cursor state, overlap boundary, last successful run and last error. Cursor updates occur only after the corresponding message page commits successfully.

### `EmailWebhookReceipt`

Stores an idempotency key, payload hash, received time, processing state and verified external message ID. Raw webhook content is not retained by default.

### `EmailSendAttempt` — separate outbound approval gate

A future outbound-hardening migration should claim a unique idempotency key before calling a provider and persist:

- immutable recipient/subject/body hash;
- approval state and approval timestamp;
- `PENDING_APPROVAL`, `APPROVED`, `SENDING`, `SENT`, `RECORD_FAILED`, `FAILED` state;
- provider response ID and bounded error metadata;
- related Activity after successful reconciliation.

This table and any routing through it require separate outbound approval. They are not part of the read-only pilot authorization.

## 6. Sync flows

### Webhook flow

1. Accept only `POST` with a strict body-size limit.
2. Authenticate a high-entropy, rotatable secret.
3. Validate content type and minimal provider identifiers.
4. Claim an idempotent `EmailWebhookReceipt`.
5. Return `202` quickly after durable receipt.
6. Fetch the message from the provider using read-only OAuth.
7. Normalize and upsert by mailbox plus external message ID.
8. Run deterministic relationship matching.
9. Advance receipt state without logging message content.

If Zoho cannot be reached, retain a bounded retry state. Never persist webhook content as verified message truth.

### Scheduled reconciliation

1. Run per enabled mailbox and folder.
2. Start from the last committed cursor with a configurable overlap window.
3. Page within provider limits and bounded concurrency.
4. Upsert messages idempotently.
5. Advance the cursor only after the page transaction succeeds.
6. Record aggregate telemetry without subjects, addresses or bodies.

Initial proposal: a 15-minute overlap and reconciliation every 10 minutes. These are configuration defaults, not schema constants.

### Outbound reconciliation

Read the Sent folder through the same provider-neutral adapter. Match CRM-originated messages by external/provider or internet message ID. Messages sent directly in Zoho enter history as verified outbound messages. Address/subject/time similarity produces only a review candidate.

## 7. Reply detection

Ordered evidence:

1. same provider thread ID within the same mailbox;
2. `In-Reply-To` matches a stored internet message ID;
3. a `References` entry matches a stored internet message ID;
4. explicit provider reply relation;
5. subject/address/time similarity only as `REVIEW_REQUIRED`.

Confirmed replies may display “Reply recorded” and join the relationship timeline. They must not complete Tasks, create commitments or change commercial stages.

## 8. CRM relationship matching

### Deterministic rules

- Normalize addresses by trimming and lowercasing only.
- Match exactly one Contact by exact email.
- Derive Account from that Contact.
- Link Lead or Opportunity only when an existing confirmed thread/entity link supplies the relationship.
- Do not use display name, email domain or company-name similarity for automatic linking.

### Ambiguous and unknown senders

- Zero Contact matches: `REVIEW_REQUIRED`, no CRM entity link.
- Multiple Contact matches: `REVIEW_REQUIRED`, list candidates without selecting one.
- Shared/group address: review-only unless explicitly mapped by a user.

Manual link/ignore actions are writes and should ship only after their API authorization and audit behavior are reviewed.

## 9. Read-only UI specification

### Account and Contact relationship memory

Add a clearly labelled “Email correspondence” source to the existing unified timeline:

- direction, subject, verified timestamp and bounded snippet;
- Contact/Account link basis;
- reply/thread status;
- provider/source label;
- “metadata only” label when body retention is disabled.

Do not convert imported messages into Activities. Existing CRM-sent EMAIL Activities may link to the normalized message to avoid duplicate timeline entries.

### Review workspace

Initial release may expose a read-only “Email Sync Health” page showing:

- last successful sync;
- verified/unmatched/ambiguous/error counts;
- disabled connection or stale cursor warnings;
- direct links to existing Contact/Account pages where a match is confirmed.

It must not expose OAuth secrets, raw headers or full addresses in aggregate logs.

## 10. API and worker boundaries

Proposed routes/functions:

| Surface | Method | Purpose |
| --- | --- | --- |
| `/api/email/webhooks/zoho` | `POST` | Secret-authenticated notification receipt; no CRM mutation beyond email sync records. |
| scheduled `email-reconcile` function | internal | Provider read and cursor reconciliation. |
| `/api/email/sync-health` | `GET` | Shared-auth protected aggregate health. |
| `/api/email/messages` | `GET` | Paginated, relationship-filtered read model. |
| `/api/email/messages/[id]` | `GET` | Sanitized verified metadata/body according to policy. |

No new public send route is included. Existing `/api/email/send` remains unchanged until outbound hardening is approved.

## 11. Security specification

- OAuth scopes: read-only messages scope for inbound pilot.
- Secrets: deployment secret store only; never repository, database plaintext or client bundle.
- Webhook: rotatable secret, body-size limit, rate limit and provider re-fetch.
- Logging: IDs may be hashed; never log tokens, message bodies, subject lines or full addresses.
- HTML: do not render provider HTML in the pilot. If later approved, sanitize server-side with a deny-by-default policy.
- Attachments: metadata only; no content download.
- Authorization: CRM read endpoints retain shared-password protection for this sprint.
- CSRF/write protection: any later manual-link or outbound endpoint requires explicit review.
- Failure behavior: provider/configuration failure must fail closed and leave CRM commercial state untouched.

## 12. Retention-policy approval gate

Recommended pilot policy, pending explicit approval:

| Data | Recommended pilot retention |
| --- | --- |
| Provider IDs, timestamps, direction and relationship links | Relationship lifetime plus 12 months, subject to legal review. |
| Subject | Same as metadata only if commercially necessary. |
| Snippet | Maximum 500 plain-text characters; 90 days. |
| Full body | Do not store during pilot. |
| Attachments | Do not ingest. |
| Raw webhook payload | Do not retain; keep hash and processing metadata for 30 days. |
| Sync errors without message content | 90 days. |

Open decisions requiring approval:

1. Whether subject lines count as retained message content.
2. Exact metadata and snippet retention periods.
3. Whether users may opt to retain selected full messages manually.
4. Deletion/export obligations and legal-hold requirements.
5. Treatment of existing full outbound bodies already stored in Activities.

No retention job should be implemented until these decisions are approved.

## 13. Migration and rollback plan

### Additive migration

1. Add provider-neutral tables and indexes only.
2. Do not alter or backfill Activity, Contact, Lead, Opportunity or Task records.
3. Deploy with every email-sync feature flag off.
4. Validate schema and connection health.
5. Enable one mailbox in preview, then production read-only pilot after approval.

Proposed flags:

- `EMAIL_READ_SYNC_ENABLED=false`
- `EMAIL_ZOHO_WEBHOOK_ENABLED=false`
- `EMAIL_RELATIONSHIP_TIMELINE_ENABLED=false`
- `EMAIL_BODY_RETENTION_ENABLED=false`
- `EMAIL_SEND_V2_ENABLED=false`

### Rollback

1. Disable webhook and reconciliation flags.
2. Restore the previous application deploy.
3. Preserve new email tables for investigation; do not drop synchronized evidence during an operational rollback.
4. Drop tables only through a separately approved destructive migration after export/retention review.

Existing CRM functionality must remain independent of the new tables while flags are off.

## 14. Observability

Aggregate metrics only:

- webhook receipts accepted/rejected/replayed;
- messages verified, inserted, updated and deduplicated;
- exact matches, unmatched and ambiguous messages;
- reconciliation duration, pages, cursor age and provider rate-limit events;
- provider fetch failures by status class;
- timeline read failures.

Alert conditions:

- cursor stale beyond 30 minutes during enabled hours;
- repeated provider authentication failure;
- webhook disabled/unresponsive indication;
- duplicate-key or transaction failure spike;
- unmatched rate unexpectedly increases.

## 15. Test specification

### Unit tests

- provider normalization and regional endpoint selection;
- cursor overlap and page-boundary behavior;
- webhook idempotency;
- exact-email matching and ambiguous/unknown cases;
- thread/header reply precedence;
- metadata-only redaction;
- retention eligibility calculations;
- timeline deduplication against existing EMAIL Activities.

### Integration tests

- duplicate webhook plus reconciliation produces one EmailMessage;
- cursor advances only after successful page persistence;
- provider outage leaves cursor and CRM state unchanged;
- malformed/unauthenticated webhook writes nothing;
- Contact/Account links exclude unrelated records;
- no Lead, Opportunity, Task or commitment mutation;
- feature flags off preserve current CRM behavior;
- migration applies and rolls back in an isolated database.

### Provider contract tests

Use recorded, redacted fixtures and a fake HTTP server. Do not call a real mailbox in CI. A live Zoho sandbox/pilot mailbox check requires explicit operational approval.

### Release smoke tests

- unauthenticated webhook/API behavior;
- read-only relationship timeline on desktop/mobile;
- duplicate notification replay;
- sync-health counts against stored rows;
- Quick Capture, conversion, CRM Health and dashboard regression;
- production record counts before/after;
- no email sent and no commercial records mutated.

## 16. Implementation sequence

1. **Specification approval:** retention, migration and pilot mailbox decisions.
2. **PR 4A — foundation:** provider-neutral types, additive schema, flags and tests. All flags off.
3. **PR 4B — Zoho read adapter:** read-only OAuth, normalization, webhook receipt and reconciliation worker.
4. **PR 4C — matching and UI:** exact Contact/Account links, review-only sync health and relationship timeline.
5. **Pilot verification:** one mailbox, metadata-first, no historical backfill, no outbound changes.
6. **PR 4D — outbound hardening:** only after separate approval; durable send attempts, server-bound approval snapshot and reconciliation.
7. **Expansion:** additional mailboxes/providers only after pilot security, retention and audit review.

Each PR gets a protected preview and must remain independently reversible.

## 17. Acceptance criteria for the read-only pilot

1. Every persisted message is verified through the provider API.
2. Duplicate webhook, poll and retry delivery produces one message record.
3. Reply status is grounded in thread/header evidence.
4. Exact Contact matching is deterministic; ambiguous cases remain unlinked.
5. Account/Contact timelines show provenance and never duplicate linked EMAIL Activities.
6. No commercial state or canonical Task is mutated.
7. Disabling flags restores pre-Sprint-4 runtime behavior without data loss.
8. No secret or message content appears in logs.
9. Production count and regression checks remain unchanged outside new email tables.
10. A different provider adapter can use the same normalized storage and UI.

## 18. Required approvals before coding

- [ ] Provider-neutral database migration.
- [ ] Retention policy and privacy handling.
- [ ] One pilot mailbox and its Zoho region/scopes.
- [ ] Netlify function/scheduler usage within the current plan.
- [ ] Manual matching write workflow, if included.
- [ ] Any full-body or attachment storage.
- [ ] Durable outbound send-attempt model.
- [ ] Any new or changed outbound sending capability.
