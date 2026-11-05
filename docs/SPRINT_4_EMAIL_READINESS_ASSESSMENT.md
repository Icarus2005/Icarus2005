# Sprint 4 — Email Readiness Assessment

**Assessment date:** 5 November 2026

**Scope:** Read-only architecture, security, cost and migration assessment.

**Decision:** The CRM is suitable for its current human-approved, outbound-only pilot. It is **not yet ready for autonomous two-way email synchronization or reliable reply detection**.

No mailbox was accessed and no email, CRM record, credential, environment variable or schema was changed while producing this assessment.

## Executive recommendation

Keep the current Zoho sender approval-gated. Before enabling inbound synchronization, add a provider-neutral email record, a verified webhook/reconciliation path, and a durable send-attempt state machine. Treat webhooks as notifications rather than trusted email content, and fetch each notified message from Zoho with read-only OAuth before recording it.

The first Sprint 4 implementation should be a **read-only inbound pilot** for one mailbox. It should show verified replies in relationship history but must not automatically change Lead status, Opportunity stage, Tasks, commitments or relationship strength.

## Current implementation

| Capability | Current state | Readiness |
| --- | --- | --- |
| Provider boundary | `EmailProvider.sendEmail()` isolates the CRM from the Zoho implementation. | Good foundation for outbound provider portability. |
| Zoho authentication | Server-side refresh token produces a short-lived access token for each send. Secrets stay in deployment environment variables. | Appropriate for one configured mailbox. |
| Outbound send | `POST /api/email/send` validates content, sends through Zoho, then records an `EMAIL` Activity. | Usable only with the current human approval flow and limitations below. |
| Human review | Sales Copilot drafts remain editable; the user must click the send confirmation. Draft generation itself does not send. | Good UX boundary, but approval is not independently attested server-side. |
| Audit data | Activity stores the final subject/body, CRM links, idempotency key and returned provider message ID. | Useful but insufficient for full threading and delivery reconciliation. |
| Inbound synchronization | No inbound endpoint, mailbox reader, cursor, scheduler or email-specific persistence model exists. | Not implemented. |
| Outbound reconciliation | CRM sends are not reconciled with the Zoho Sent folder. Mail sent outside the CRM is not imported. | Not implemented. |
| Reply detection | `replyToMessageId` is reserved but unused. No thread ID, RFC `Message-ID`, `In-Reply-To` or `References` is stored. | Not implemented. |
| Multiple mailboxes/users | One `ZOHO_ACCOUNT_ID` and `ZOHO_FROM_ADDRESS` are configured globally. | Not ready for per-user mailboxes. |

## Zoho integration assessment

Zoho Mail exposes the required primitives:

- message search and folder listing;
- message metadata, headers and content;
- provider message and thread identifiers;
- sending a reply against an existing message;
- outgoing webhooks for incoming mail events.

Official references:

- [Zoho Mail Email Messages API](https://www.zoho.com/mail/help/api/email-api.html)
- [Search messages API](https://www.zoho.com/mail/help/api/get-search-emails.html)
- [Message headers API](https://www.zoho.com/mail/help/api/get-email-header.html)
- [Reply API](https://www.zoho.com/mail/help/api/post-reply-to-an-email.html)
- [Zoho Mail outgoing webhooks](https://www.zoho.com/mail/help/dev-platform/webhook.html)
- [Zoho OAuth 2.0 guide](https://www.zoho.com/mail/help/api/using-oauth-2.html)

The current data-center setting is operationally flexible because it is interpolated into the endpoint, but its source comments list fewer regions than Zoho now documents. Zoho documents UAE (`mail.zoho.ae`) and Saudi (`mail.zoho.sa`) endpoints in addition to the older regions. The mailbox's actual tenant URL must determine the configured data center; it must not be guessed from the company's location.

Use separate least-privilege grants where Zoho permits it:

- read integration: `ZohoMail.messages.READ`;
- outbound/reply integration: `ZohoMail.messages.CREATE` or the minimum supported send scope;
- avoid `ALL` unless a tested endpoint requires it.

## Recommended inbound/outbound synchronization

### 1. Provider-neutral boundary

Retain `EmailProvider` for sending and add a separate read interface such as `MailboxReader`:

```ts
type MailboxReader = {
  listMessages(cursor: MailboxCursor): Promise<MessagePage>;
  getMessageMetadata(externalMessageId: string): Promise<MessageMetadata>;
  getMessageHeaders(externalMessageId: string): Promise<MessageHeaders>;
};
```

Zoho-specific response shapes should stop at the adapter boundary. CRM services should receive normalized message/thread records.

### 2. Webhook plus reconciliation

Use Zoho's outgoing webhook as a low-latency wake-up signal. Do not trust its body as CRM truth. The receiver should:

1. authenticate a high-entropy, rotatable webhook secret;
2. validate size, content type and required identifiers;
3. enqueue or record an idempotent notification;
4. retrieve the message from Zoho using read-only OAuth;
5. store only the verified provider response.

Zoho states that webhook configurations can be disabled if the target remains unresponsive. A scheduled reconciliation process is therefore still required. It should use an overlap window and deduplicate by provider account plus external message ID rather than depend on a single timestamp cursor.

Zoho currently documents an API limit of 30 requests per minute and search pages of up to 200 messages. Reconciliation must use pagination, backoff and bounded concurrency. See [Zoho Mail rates and limits](https://www.zoho.com/mail/help/adminconsole/rates-and-limits.html).

### 3. Relationship matching

Automatic matching should be deliberately conservative:

- match a sender/recipient only to an exact normalized Contact email;
- derive Account only from that confirmed Contact relationship;
- link a Lead or Opportunity only from an already recorded thread/context association;
- send unmatched or ambiguous mail to a review queue;
- never create Contacts, qualify Leads, change Opportunity stages or complete Tasks from an email alone.

### 4. Outbound reconciliation

Import outbound messages sent directly from Zoho as read-only relationship history. CRM-originated sends should be matched first by stored provider message ID or RFC message ID, not by subject and timestamp. Subject/date/address matching may be shown only as a review candidate.

## Reply detection

Reply detection should use ordered evidence:

1. provider thread ID from Zoho;
2. RFC `In-Reply-To` or `References` matched to a stored internet `Message-ID`;
3. explicit reply-to-provider-message association;
4. address/subject/time similarity only as a review candidate, never a confirmed reply.

Zoho's search response includes message ID, thread ID and reply status, while its header endpoint exposes internet headers. The current `Activity.providerMessageId` alone is not enough: it is audit metadata and may not be the RFC internet `Message-ID` needed for cross-provider migration.

A verified inbound reply may update a derived display such as “Reply recorded” and appear in the relationship timeline. It must not automatically close the originating Task or claim that a commitment was made.

## Approval and security assessment

### Controls already present

- The entire application and API remain behind the shared-password middleware.
- Draft generation does not send.
- Final subject and body are editable before the explicit send action.
- Recipient, subject and body are validated.
- Provider failures do not create a successful EMAIL Activity.
- Sequential replay of a persisted idempotency key does not resend.
- Secrets and Zoho response bodies are not logged by the provider implementation.

### Gaps to resolve before expanding email

1. **Approval identity is not recorded.** Shared access cannot establish which person approved a send. Preserve shared authentication for the current sprint, but record an approval event/nonce and actor label when a stronger identity model becomes available.
2. **Approval is primarily a client-side state transition.** The API accepts any authenticated POST with valid fields; it does not require a short-lived server-issued approval token bound to recipient, subject, body hash and entity.
3. **Recipient integrity is incomplete.** The server verifies that a Contact exists but does not require `to` to equal that Contact's recorded email or require an explicit override reason.
4. **Related Task scope is not verified.** A supplied Task only needs to exist; its relationship to the Contact/entity is not checked.
5. **Idempotency is not durable before provider send.** The key is written only after Zoho confirms the send. If Zoho succeeds and Activity creation fails, a retry can send again. Two concurrent first attempts can also both reach the provider before the unique Activity constraint is written.
6. **No delivery/sent-folder reconciliation exists.** A recorded provider response is not independently reconciled with the mailbox.
7. **Inbound webhook authenticity is undefined.** Zoho's public webhook guide warns that webhook URLs are sensitive but does not document a signed request in the reviewed material. Use a secret plus API re-fetch; never rely on source IP or payload content alone.
8. **Email content is sensitive.** The current Activity stores full outbound plaintext. Before importing inbound bodies, define retention, redaction, access and HTML sanitization policy. Defaulting to metadata/summary is safer than indiscriminate full-mail storage.

The durable-send fix needs a schema-backed send attempt/outbox with states such as `PENDING_APPROVAL`, `APPROVED`, `SENDING`, `SENT`, `RECORD_FAILED` and `FAILED`, with a unique idempotency key claimed before any provider call. This is a separately approved migration, not part of this read-only assessment.

## Provider-neutral data model for a future migration

Do not add Zoho-specific columns to Activity. A future migration should introduce provider-neutral records along these lines:

- `MailboxConnection`: provider, provider account key, from address, data center, enabled state and cursor metadata; no OAuth secret in the database unless encrypted with a managed key.
- `EmailThread`: provider-neutral thread key plus optional provider thread key.
- `EmailMessage`: direction, provider, external message ID, internet message ID, thread ID, reply/reference IDs, sender/recipients, subject, sent/received timestamp, sync state, and explicit CRM links.
- `EmailSendAttempt`: approval snapshot/hash, idempotency key, provider response, error state and timestamps.

Activity can reference a verified EmailMessage for timeline display, or the timeline can read both sources without converting historical email records into Activities. Provider IDs should always be namespaced by provider and mailbox account.

This boundary allows a later Zoho-to-Microsoft Graph or Gmail migration without rewriting relationship logic. A new adapter maps provider data into the same normalized records; external IDs remain provider-scoped and RFC message IDs remain portable where available.

## Cost assessment

No additional paid service is required for the proposed read-only pilot if the existing Zoho mailbox plan includes Developer Space/API access and current Netlify quotas cover the webhook plus scheduled reconciliation. Confirm both in the actual tenant before implementation.

Zoho's official UAE list currently shows, per user per month:

- Mail Lite 5 GB: **AED 3.65**, annual subscription;
- Mail Lite 10 GB: **AED 4.57**, annual subscription;
- Mail Premium: **AED 14.60**, annual subscription;
- Workplace Standard: **AED 14.60 monthly** or **AED 10.95 annual-equivalent**.

Zoho states that applicable UAE VAT is additional. Prices and rate limits can change, so release approval should recheck the [official pricing page](https://www.zoho.com/mail/zohomail-pricing.html). Developer Space is currently listed for Mail Lite, Mail Premium and Workplace plans.

Indicative implementation effort—not a vendor quote:

| Workstream | Estimate |
| --- | ---: |
| Durable approval/send-attempt security | 2–3 engineering days |
| Provider-neutral schema and migration | 1–2 days |
| Zoho read adapter, webhook verification and reconciliation | 2–3 days |
| Matching/review UI, observability and QA | 2–3 days |
| **Total first read-only pilot** | **7–11 engineering days** |

## Recommended implementation gates

1. Approve the minimal provider-neutral migration and retention policy separately.
2. Harden outbound approval and durable idempotency before adding any new sending capability.
3. Add a read-only Zoho adapter and authenticated webhook receiver.
4. Backstop the webhook with bounded scheduled reconciliation.
5. Pilot one mailbox with metadata-first storage and an unmatched-message review queue.
6. Verify exact-contact matching, duplicate delivery, cursor overlap, replayed webhook, provider outage and rate-limit behavior.
7. Add reply indicators to relationship memory without automatic commercial-state mutation.
8. Expand to additional mailboxes/providers only after the pilot's audit trail and privacy controls are accepted.

## Sprint 4 release criteria

- No inbound event is persisted without provider verification.
- Duplicate webhook/poll delivery produces one EmailMessage.
- A provider-success/database-failure send cannot silently resend.
- Every send has an immutable approval snapshot and traceable status.
- Replies are confirmed by thread/header evidence, not subject text alone.
- Unknown/ambiguous addresses remain review-only.
- No email automatically mutates Lead status, Opportunity stage, Task completion or client commitments.
- Zoho disconnection leaves existing CRM history readable and permits a different provider adapter.
