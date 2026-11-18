# BrandSprk fundraising workflow

The fundraising workspace at `/fundraising` manages the BrandSprk-only $300,000 pre-seed round. Commercial validation remains early. Valuation cap, issuing entity and IP scope need confirmation before quoting terms.

## Operation

1. Choose the private JSON tracker export under **Import private funding tracker**. Review the preview and import. The unique round/source ID prevents repeat imports from duplicating routes. Existing records and human edits are skipped, never overwritten.
2. Select a route. Link an existing verified CRM contact, or create one using the existing contact flow. Imports deliberately do not guess people, emails, companies or contact matches.
3. Review/edit the subject, message and sending condition. Save the route and draft. A condition such as connection acceptance or prior submission verification must be checked by the operator.
4. For a new introduction, check both approval boxes and use **Approve and send via Zoho**. The recipient must match the saved contact email. Existing submissions and follow-up replies must use the original Zoho thread; send there, then use **Record confirmed send** with the actual timestamp and channel. No attachments or reply-thread identifiers are handled by the new-send screen.
5. A confirmed initial send creates two shared CRM Tasks, due at 09:00 Dubai after five and ten Monday-Friday business days. No holiday calendar is assumed. Follow-up dates are anchored to the actual initial send, not planned worksheet dates. Logging the first follow-up closes its task. Logging the final follow-up closes the sequence and pauses outreach. Nothing sends automatically.
6. Record a reply, rejection or pause as an existing CRM Activity. Pending system follow-ups close immediately. Unrelated relationship tasks stay open. A reply made while a provider request is in flight still stops follow-ups when the send returns. Use the RESPONSE step to record subsequent messages in an active conversation without restarting the automated sequence.
7. Enter confirmed commitments and received cash separately, with dated supporting evidence. Received cash cannot exceed confirmed commitments. These records never create commercial Opportunities or contribute to sales forecasts.

The daily action queue is a live view of active unstarted/qualification routes and due follow-up tasks. Refresh it to reflect new events and Dubai dates. There is no scheduler or mailbox monitor in this change. Replies must be recorded manually until a separately approved mailbox integration is available.

## Uncertain deliveries

A delivery reservation is committed before calling the existing provider adapter. Repeat keys return the recorded outcome; different keys cannot send concurrently to the same route while delivery is unresolved. Failed/time-out provider calls and failed post-send recording become UNCERTAIN. They do not automatically retry or invent a successful Activity.

Check Zoho Sent before continuing. After ten minutes, the workspace allows an operator to record a verified SENT or NOT SENT outcome with evidence. SENT reconciliation creates the Activity and follow-ups once. NOT SENT releases the block and records a reconciliation note. New attempts require a fresh approval and request key. A SENDING attempt left by a terminated process is also reconciled through this screen.

The shared CRM Activity remains the interaction history; FundraisingDispatch is delivery control. Dispatch payloads contain approved message content for reconciliation. Apply the same access and retention policy as manually composed CRM email Activities.

## Import contract

The JSON file is either an array or `{ "rows": [...] }`. Each row has:

| Field | Meaning |
| --- | --- |
| sourceKey | Stable ID within this round, maximum 80 characters |
| name, routeType | Display name and introduction/fund/programme route |
| priority | Now, Qualify or Hold |
| status | NOT_STARTED, SUBMITTED_PREVIOUSLY, NEEDS_QUALIFICATION or HOLD |
| nextAction, notes, evidence | Planned action, relationship context and source reference |
| source, sourceStatus | Original filename/provenance and original status |
| drafts | Array of id, subject, body, channel and condition |

Import does not accept actual-send timestamps, contact IDs, commitments or received amounts. A past submission is preserved as context, not a newly sent message. Generic forwardable/follow-up drafts can appear in more than one route. Keep the populated investor import outside this public repository. Only synthetic fixtures belong in tests.

## Deployment and validation

The additive migration `20261118120000_fundraising` adds fundraising tables, nullable Task/Activity links, constraints and the BrandSprk catalogue/commercial template. It does not reseed/reset contacts, tasks, opportunities or sample data. The normal development seed also includes BrandSprk through the shared product taxonomy. Do not run the full development seed on production.

Review and deploy the migration with the existing production release process. Applying it to a preview using a shared production database is not part of this change. Existing shared HTTP Basic Auth applies; no new user/role model is introduced. Configure the existing Zoho provider only in the intended protected environment. This change does not activate mailbox ingestion or depend on the separate mailbox-sync branch.

Run type-checking, build and the full test suite. Database tests require disposable local PostgreSQL. New fundraising tests enforce a localhost/127.0.0.1 database name containing `disposable` and always inject fake email providers. Use `node --import tsx --test --test-concurrency=1 tests/*.test.ts` where the tsx CLI's IPC socket is unavailable. Enable `EMAIL_FOUNDATION_DISPOSABLE_DB_TESTS=true` and use a database name containing `sprint4a_disposable` to include the existing email-foundation DB tests.
