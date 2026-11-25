# Investor contact intake — signed webhook (release-gated)

Status: code in PR only; **disabled by default**, no public site wired yet.

This handler accepts a very narrow **opt-in contact enquiry** from the BrandSprk or PlacePulse public investor websites and queues it for private qualification in ArqOne CRM. It does not track website visits, record voice transcripts, send emails, create investors as contacts, schedule follow-ups, or make financial claims.

## Inbound route

`POST /api/fundraising/inbound` on the protected CRM origin.

The global Basic Auth gate has a narrow exception for this path; authorization is enforced in the handler with **HMAC-SHA256 over exact request bytes**.

Required production environment:

- `CRM_INBOUND_INVESTOR_ENABLED=true` (disabled unless set precisely)
- `CRM_INBOUND_INVESTOR_HMAC_SECRET` (random private value, 32+ characters)

On each **originating site's server**, privately configure the same secret. Never put it in public JavaScript, client configuration, query strings, or GitHub. A server-side route must sign and forward only a validated, human-initiated, consented form request.

Headers:

- `x-arqone-timestamp`: Unix seconds, limited to +/- 300 seconds
- `x-arqone-signature`: lowercase hex HMAC-SHA256 of `<timestamp>.<exact UTF-8 JSON body>`

Body (max 8 KiB):

```json
{
  "eventId": "inquiry-20261125-generated-server-unique",
  "roundKey": "brandsprk-preseed-2026",
  "fullName": "Prospective investor",
  "organization": "Example capital firm",
  "email": "contact@example.test",
  "message": "I would like to request the investor overview.",
  "sourcePage": "https://www.brandsprk.io/invest",
  "consent": true,
  "consentVersion": "2026-11"
}
```

For PlacePulse, set `roundKey` to `placepulse-preseed-2026` and `sourcePage` to `https://www.placepulse.io/invest`.

The request must have explicit contact consent. The receiving CRM cannot independently prove that consent was genuinely obtained by the originating website; review the frontend disclosure, consent control and server-side validation before activating.

Successful signed requests create a **NEEDS_QUALIFICATION** private FundraisingProspect with no contact link, sends, tasks or capital. Retries using the same event ID and venture are idempotent, never overwrite human edits, and yield 202 Accepted.

The submitted name, organization, unverified email and bounded message are stored in the protected CRM route notes. Enforce applicable privacy notice, access restrictions, retention and deletion rights before enabling, and never store raw voice transcripts or investor Q&A here.

## Deployment gates

1. Review the signed webhook code and test suite, including disabled-mode and duplicate/replay tests.
2. Confirm a realistic retention/deletion policy and legal privacy notice for both public sites.
3. Add per-IP + per-email rate limiting, spam filtering and a honeypot or equivalent at each **originating** public website. The CRM authenticates source servers but not end-user identity.
4. Implement public investor form UI separately in both websites with work email, organization, contact request, and explicit consent. PlacePulse's existing **pilot request** form must remain separate.
5. Ensure each website's **server** submits the signed payload. Verify the correct matching venture, idempotency and evidence under an isolated non-production CRM database.
6. Provision the shared secret in intended production environments and activate the receiver only after explicit deployment approval.
7. Never copy real investor names, emails, secrets or submissions into the public GitHub repository or PR logs.
8. Test live delivery with synthetic email and a verified 202 result, then verify route creation and no mail sent. Do not run a production demo using a real person's contact details without consent.

## Known deliberate omissions

- No rate limiting at the CRM receiver itself (signed server-only route; origin sites must rate-limit).
- No per-message or per-investor ownership verification; identity remains unverified until manually qualified.
- No auto-generated outreach or AI follow-up based on inbound form submissions.
- No lead attribution from page-visit analytics or voice engagement.
- No caller access to any stored investor data. GET is disabled.
