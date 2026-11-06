# Sprint 4A — Email Foundation Delivery Notes

**Baseline:** `7b391e401ee7621e38e139fd30e087e356701172`

**Scope:** provider-neutral, metadata-only foundation

**Runtime status:** disabled; no mailbox adapter, credentials, synchronization, webhook, scheduler or sending change is included

## Delivered boundary

- `MailboxReader` is read-only and returns normalized provider-neutral metadata.
- Normalization uses an explicit allow-list. Bodies, snippets, attachments, raw headers and raw provider payloads cannot cross the boundary.
- Message identity is `(provider, providerAccountKey, externalMessageId)` in memory and `(mailboxConnectionId, externalMessageId)` in persistence.
- Mailbox and thread foreign keys use restrictive deletion semantics so deleting configuration cannot cascade away message history.
- Message/thread linkage uses a composite foreign key, preventing a message from referencing a thread owned by another mailbox.
- Contact matching is trim-and-lowercase exact email equality only. Zero or multiple matches remain unlinked/review-only.
- Reply evidence is evaluated in this order: provider thread, RFC `In-Reply-To`, RFC `References`, explicit provider reply relation. Address/subject/time similarity is never confirmation.
- RFC Message-IDs are stored without syntactic angle brackets and with semantic case preserved, following RFC 5322 section 3.6.4.
- The additive Prisma proposal contains `MailboxConnection`, `EmailThread`, `EmailMessage` and `EmailSyncCursor`. It does not modify or backfill existing CRM models.
- `MailboxConnection.enabled` defaults to `false` and all application feature flags default to `false`.

The schema intentionally has no message-body, snippet, attachment, raw-header or raw-payload column. `secretReference` may identify deployment configuration but must never contain an OAuth token or other secret.

## Default-disabled controls

```text
EMAIL_READ_SYNC_ENABLED=false
EMAIL_ZOHO_WEBHOOK_ENABLED=false
EMAIL_RELATIONSHIP_TIMELINE_ENABLED=false
EMAIL_BODY_RETENTION_ENABLED=false
EMAIL_SEND_V2_ENABLED=false
```

Only the case-insensitive literal `true` enables a flag. Missing, blank, `1`, `yes` and malformed values fail closed. Sprint 4A does not consume these flags from a route or worker because no email runtime has been added.

## Minimal retention proposal — approval required

This is a proposal, not an implemented cleanup job or legal conclusion.

| Data | Proposed maximum | Rationale |
| --- | --- | --- |
| Provider/message/thread IDs, RFC reply evidence, direction and timestamps | Relationship lifetime plus 12 months | Preserve deduplication and defensible relationship history. |
| Normalized participant addresses | Relationship lifetime plus 12 months | Required for deterministic matching; treat as personal data. |
| Subject | 90 days, unless legal/commercial review approves longer | Subject lines can contain sensitive message content. |
| Body, snippet, attachments and raw headers | Do not collect or store | Structurally excluded in Sprint 4A. |
| Raw webhook/provider payload | Do not retain | Future webhooks must re-fetch and allow-list provider-verified metadata. |
| Non-reversible raw-payload hash | 30 days | Short diagnostic window only; no source payload is retained. |
| Cursor and aggregate sync state | Connection lifetime plus 30 days | Operational recovery without message content. |
| Bounded error code/timestamp | 90 days | Troubleshooting without addresses, subjects or bodies. |

Before any pilot, approve deletion/export behavior, legal holds, data-subject requests, the status of subject lines as content, and treatment of existing outbound bodies already stored in `Activity.notes`. Do not implement a retention job until those decisions are approved.

## Cost proposal — verify at pilot approval

Sprint 4A adds no active runtime and therefore has no expected incremental provider, function or mailbox cost.

For a later read-only pilot:

- Zoho Developer Space exposes REST APIs and webhooks, but the actual tenant plan and region must be checked before assuming API access is included: <https://www.zoho.com/mail/help/developer-space.html>.
- Netlify Functions are available across current plans. The current Free plan is listed at USD 0 with 300 monthly credits; existing accounts may remain on legacy pricing, so the team dashboard is the billing source of truth: <https://www.netlify.com/pricing/>.
- A ten-minute reconciliation schedule is about 4,320 scheduled invocations per 30-day month before webhook or pagination traffic. This is not enabled or budgeted in Sprint 4A.
- Netlify Database is Neon-backed in this repository's documented setup. Neon announced 1 GB per Free project in October 2026, but the connected project's actual quota must be checked: <https://neon.com/blog/neon-free-plan-1-gb-per-project>.
- Metadata-only storage should be measured from redacted fixtures before approval. A planning allowance of 2–5 KB per message including indexes is roughly 0.2–0.5 GB per 100,000 messages, excluding Postgres overhead and backups. This is an estimate, not a vendor quote.

No paid upgrade should be approved until a redacted-volume test reports messages/day, pages/run, function credits and measured bytes/message.

## Migration safety and rollback

- Migration validation must use a local database explicitly named `sprint4a_disposable`; the database regression test refuses other database names and requires `EMAIL_FOUNDATION_DISPOSABLE_DB_TESTS=true`.
- No production or shared database URL is required for this PR.
- Netlify deploy-preview and branch-deploy contexts run `prisma generate` and the application build only; they cannot run `prisma migrate deploy`.
- Operational rollback is to leave every flag and every connection disabled and restore the prior application deploy. The additive tables remain untouched for investigation.
- Dropping tables or synchronized evidence is a separate destructive migration requiring retention/export review and explicit approval.

## Approval gates

- [ ] Provider-neutral additive migration approved for production.
- [ ] Retention, deletion/export and legal-hold policy approved.
- [ ] Pilot mailbox, tenant region and least-privilege read scope approved.
- [ ] Netlify function/scheduler budget approved.
- [ ] Webhook authentication and provider re-fetch design approved.
- [ ] Manual matching writes and audit behavior approved, if later added.
- [ ] Any body, snippet, attachment or raw-header storage approved separately.
- [ ] Any outbound hardening or sending change approved separately.
- [ ] Production deployment explicitly approved.
