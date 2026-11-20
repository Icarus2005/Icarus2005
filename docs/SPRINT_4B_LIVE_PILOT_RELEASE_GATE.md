# Sprint 4B — controlled read-only pilot release gate

**Status:** NOT APPROVED FOR LIVE PILOT. This is an operational decision record for [draft PR #7](https://github.com/Icarus2005/Icarus2005/pull/7), not approval to merge, deploy, connect a mailbox, grant OAuth access or run a migration.

**Production baseline:** `16ef8d986dfe80547b87f70967f61e9f1ed6903c`.

## Non-negotiable boundaries

- All five email flags stay `false`, including `EMAIL_READ_SYNC_ENABLED`.
- No read-client credentials may be added to code, this document, GitHub, test fixtures, screenshots, issue comments or logs.
- No mailbox connection is created or enabled until a named mailbox owner authorizes that specific mailbox and folder scope.
- No message bodies, snippets, attachments, original MIME, raw headers, raw payloads or message content enter storage.
- No automated Contacts, Accounts, Leads, Opportunities, Tasks, Activities, commercial-state changes or outbound messages.
- A passing CI test suite does not substitute for privacy, security, operational or production-release approvals.

## Decision register (all outstanding unless separately evidenced)

| Gate | Decision/evidence required | Owner | Status |
| --- | --- | --- | --- |
| Mailbox authorization | Named owner, exactly one pilot address, Inbox/Sent selection, approved 30-day retrospective window | TBD | OPEN |
| Tenant identity | Verify Zoho region, account ID, Inbox and Sent folder IDs directly in tenant | TBD | OPEN |
| OAuth least privilege | Separate `ZohoMail.messages.READ` client; no send/write scopes; account matched to pilot connection | TBD | OPEN |
| Secret operations | Netlify secret-storage permission, rotation and revocation owner; no shared outbound credential | TBD | OPEN |
| Privacy/data collection | Written acceptance of message identifiers, addresses, subjects, timestamps, normalized reply headers, match/reply evidence | TBD | OPEN |
| Content exclusions | Written prohibition of body/snippet/attachment/MIME/raw header/raw payload collection | TBD | OPEN |
| Subject retention | Approve 90-day maximum and implement/test a retention job before claiming enforcement | TBD | OPEN |
| Rights/deletion | Document export/delete, legal hold, backup-expiry and data-subject procedures, and identifier lifetime | TBD | OPEN |
| CRM authorization | Replace or explicitly accept shared-password metadata visibility; identify permitted users and unmatched-review access | TBD | OPEN |
| Matching | Accept exact Contact-email match with Account derivation; unmatched/ambiguous remains manual-review-only | TBD | OPEN |
| Operations | Name monitoring/escalation owner, Netlify/DB/Zoho usage alert thresholds, failure/backoff procedure | TBD | OPEN |
| Production change | Fresh restorable backup, independent approval of additive migration, then independent pilot activation approval | TBD | OPEN |

**Blocking policy choices:** The current CRM access gate uses a shared password. Do not assume this is sufficient for sensitive subject lines and participant addresses. Likewise, the proposed 90-day subject retention is **not yet enforced by a cleanup job**. Both require explicit design and sign-off before a live pilot.

## Before approving a disabled production release

1. Verify the branch is still draft and that the intended PR head passes GitHub Actions against its local disposable PostgreSQL 18 service: nine migrations, schema status/drift, TypeScript, ESLint, full DB-backed tests, application build.
2. Confirm all flags are false in deployed configuration and no `ZOHO_READ_*` secrets or enabled `MailboxConnection` exist.
3. Capture a verified restorable production database backup with timestamp, checksum and backup-expiry responsibility.
4. Review additive migration SQL against production schema. Approve the **migration and disabled-code release separately**. Never infer this approval from CI or from the existence of this document.

## Optional live pilot, only after every gate is signed

1. Document the chosen mailbox, owner, region, exact Inbox/Sent folder IDs, 30-day window and the users permitted to view metadata.
2. Create a separate read-only Zoho OAuth client. Record only the names of secrets and the rotation owner in the decision register; keep actual values in approved Netlify secrets.
3. Prepare one disabled `MailboxConnection` mapped to the credential account and email address. Verify authorization and access controls before enabling it.
4. Set usage alerts. Scheduled reconciliation is fixed at 30 minutes UTC. Production configuration is hard-capped to **5 messages per folder and 1 page per run** (22 Zoho Mail metadata/list/header GETs maximum per full run); larger batches require new code review.
5. After a separate authorization, enable only the selected connection and `EMAIL_READ_SYNC_ENABLED=true`. Keep webhook, timeline, body retention and outbound-v2 flags false.
6. Observe the first three scheduled runs: elapsed time below Netlify's documented 30-second limit, API errors/429s, cursor/backoff, match counts and duplicate/idempotency behavior.
7. Reconcile a small owner-approved sample against Zoho without exporting or copying message content to the CRM, support logs or issue comments.
8. Confirm unmatched/ambiguous messages trigger only manual review and do not create or update commercial entities.
9. Confirm retention/deletion behavior, user access, usage costs and monitoring handoff before extending the pilot.

## Stop / rollback

- For unexpected access, privacy leakage, provider-side anomalies, repeated timeouts, rate-limit exhaustion, or unexplained commercial mutations, **disable `EMAIL_READ_SYNC_ENABLED` immediately**, then disable the pilot connection.
- Revoke/rotate read OAuth credentials if exposure is suspected. Keep outbound credentials unchanged.
- Verify the scheduler exits before any DB/provider access while disabled. Preserve bounded operational metadata for investigation within the approved retention policy.
- **Do not delete pilot data, reverse a production migration or roll back a release without explicit production-data approval**. Determine the exact affected records and backup/retention implications first.
- Record incident owner, observed timestamps, provider error category, remediation and re-approval before reactivation.

## Acceptance criteria

A pilot is complete only when the owner signs off on correct mailbox identity, exactly authorized metadata, demonstrably safe user access, bounded cost and runtime, reconciled exact matches, non-mutating unmatched review, implemented retention/deletion rules, working disable/revoke controls and an owner-supported operational handover.

See [Sprint 4B technical and privacy specification](SPRINT_4B_READONLY_MAILBOX_INTELLIGENCE.md) for the detailed architecture and full approval checklist.
