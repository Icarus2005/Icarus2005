# Sprint 4B — Read-only mailbox intelligence

**Production baseline:** `16ef8d986dfe80547b87f70967f61e9f1ed6903c`

**Runtime state:** disabled. This branch contains no mailbox credentials and does not connect to Zoho or any other live mailbox.

## Delivered design

- `MailboxReader` remains the provider-neutral, read-only boundary.
- `ZohoMailboxReader` uses only Zoho list, metadata and `raw=false` header GET endpoints. It never calls content, original-message, attachment or mutation endpoints.
- Provider responses are allow-listed into `NormalizedMailboxMessage`; bodies, summaries/snippets, attachments, raw headers and raw provider payloads are discarded before persistence.
- Synchronization is gated by both `EMAIL_READ_SYNC_ENABLED=true` and `MailboxConnection.enabled=true`. Both default to false.
- Automatic relationship matching uses one exact normalized Contact email only. The Account is derived from that Contact. Unknown, multiple-recipient and ambiguous matches remain review-only.
- Reply evidence is evaluated in order: provider thread, RFC `In-Reply-To`, RFC `References`, then explicit provider reply relation. Similarity is never a confirmed reply.
- Message upserts use `(mailboxConnectionId, externalMessageId)`. A verified page is replayed oldest-first so thread/header evidence converges without duplicate rows.
- Cursor state records attempts, successes, bounded error codes, consecutive failures and exponential backoff. It never stores provider error bodies.
- Account and Contact Relationship Memory can show metadata-only correspondence when `EMAIL_RELATIONSHIP_TIMELINE_ENABLED=true`; the flag remains false.
- `/admin/email-health` reports disabled/healthy/degraded/stale connections and unmatched metadata. It cannot create or modify commercial records.

## Reconciliation schedule

`netlify/functions/email-reconcile.ts` declares `*/30 * * * *` (UTC). Netlify documents that scheduled functions run only on published deploys; Deploy Previews and branch deploys do not run them automatically. The worker exits before database or provider access while the read-sync flag is disabled.

Defaults:

| Setting | Default | Purpose |
| --- | ---: | --- |
| Interval | 30 minutes (fixed Netlify cron) | 48 scheduled checks/day |
| Initial lookback | 30 days | bounded initial history |
| Overlap | 60 minutes | safe replay after cursor/provider delay |
| Page size | 5 messages/folder | keeps inbox + sent below the documented 30 Mail API requests/minute |
| Pages/folder/run | 1 | bounded 30-second function execution |
| Retry | 5–360 minutes | capped exponential outage recovery |

Continuation tokens preserve unfinished lookback work. Zoho folder pagination uses mutable numeric offsets, so the service records the start of a multi-run scan and calculates the next overlap from that start time, not the final page's completion time. This replays mail that arrived while older pages were being scanned. Delayed inbound mail is compared by arrival timestamp where Zoho provides it. Duplicate scans remain idempotent. Changes and deletions within historical pages can still shift offsets; an owner should review pilot match counts and reconciliation health before treating the import as complete.

## Additive data model

The Sprint 4B migration adds only:

- exact Contact/Account links and match state on `EmailMessage`;
- confirmed/review-only reply state and a same-mailbox reply relation;
- cursor attempt, failure, retry and per-run count telemetry;
- supporting indexes and restrictive/set-null foreign keys.

No body, snippet, attachment, raw-header or raw-payload column exists. No Lead, Opportunity, Task, Activity or other commercial table is changed by the migration or synchronization service.

## Operating-cost assessment

This is a planning estimate, not a vendor quote.

- A 30-minute schedule is about **1,440 invocations per 30-day month**.
- An idle run makes two Zoho Mail list requests (Inbox and Sent), or about **2,880 Mail API requests/month**, plus OAuth refresh traffic.
- During catch-up, the default cap is at most 22 Mail API calls/run (two list calls plus metadata and header calls for five messages in each folder), or **31,680 Mail API calls/month** if every run remains full.
- Zoho currently documents **30 API requests/minute**. The bounded sequential worker is designed below that per-run ceiling: <https://www.zoho.com/mail/help/adminconsole/rates-and-limits.html>.
- Netlify currently meters Functions compute at **10 credits/GB-hour** and web requests at **2 credits/10,000 requests** on credit-based plans: <https://www.netlify.com/pricing/>. At the default 1 GB allocation, 1,440 runs averaging 1 second are about 0.4 GB-hours (about 4 compute credits); averaging 5 seconds is about 2 GB-hours (about 20 credits). Initial catch-up and database compute/bandwidth add usage.
- Scheduled Functions have a documented 30-second limit and do not execute automatically on previews: <https://docs.netlify.com/build/functions/scheduled-functions/>.
- Zoho incremental subscription cost is expected to be **zero only if** the existing tenant plan includes Developer Space/API access. The actual tenant subscription and region must be verified before approval.
- Metadata storage should be measured during a redacted pilot. The Sprint 4A planning allowance remains 2–5 KB/message including indexes (roughly 0.2–0.5 GB per 100,000 messages, excluding database overhead and backups).

Approval should set monthly alert thresholds for Netlify function credits, database compute/bandwidth, stored rows and Zoho API errors before enabling the pilot.

## Exact approvals required for a live pilot

All items below are mandatory and separate from approving this draft PR:

1. **Mailbox owner and scope:** name one pilot mailbox, its accountable owner and the approved Inbox/Sent folders; confirm the owner authorizes a 30-day retrospective metadata import.
2. **Tenant and region:** verify the mailbox’s actual Zoho tenant URL/data region and Account/Folder IDs. Do not infer region from company location.
3. **Least-privilege OAuth:** approve a new, separate OAuth client restricted to `ZohoMail.messages.READ`; explicitly prohibit send/create/update/delete scopes and prohibit reuse of outbound sender credentials.
4. **Secret handling:** approve Netlify secret storage and rotation owners for the read-only client ID, client secret and refresh token. No secret may be stored in Postgres, logs, PRs or support exports.
5. **Collected metadata:** approve storage of provider/thread/message IDs, RFC Message-ID/reply headers after normalization, participant addresses, direction, subject, folder key and timestamps, plus derived Contact/Account and reply evidence.
6. **Explicit exclusions:** confirm bodies, HTML, snippets/summaries, attachments, raw headers, original MIME, webhook payloads and provider error bodies remain prohibited. Any future exception needs a new privacy/security approval and migration.
7. **Subject-line treatment:** approve subject lines as potentially sensitive content, the proposed 90-day maximum retention and the people permitted to view them.
8. **Retention and rights:** approve deletion/export behavior, legal holds, backup expiration, data-subject access/deletion requests and the proposed relationship-lifetime-plus-12-month limit for identifiers/addresses. A retention job must be separately implemented and tested before claiming automated enforcement.
9. **CRM access model:** accept or replace the current shared-password access gate for mailbox metadata; name who may see correspondence and unmatched-address reporting.
10. **Matching policy:** approve exact Contact-email matching with Account derivation only; confirm unmatched/ambiguous mail will not create Contacts or modify Leads, Opportunities, Tasks, Activities, commitments or relationship strength.
11. **Operations and cost:** approve the 30-minute schedule, 30-day lookback, overlap/backoff limits, Netlify/Zoho usage thresholds, monitoring owner and outage/rate-limit escalation path.
12. **Release controls:** approve the additive migration on a fresh production backup, then separately approve setting one `MailboxConnection.enabled=true`, configuring read-only secrets and setting `EMAIL_READ_SYNC_ENABLED=true`. Keep webhook, body-retention and outbound-v2 flags false.

Until all approvals are recorded, the correct state is: no connection, no credentials, all flags false and no production deployment.
