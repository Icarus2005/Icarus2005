# ArqOne CRM — Investor Outreach Engine V1 (24 November 2026)

Status: implementation plan, not live sending authorization. Owner: ArqOne Labs.

## Goal

Operate two separate, evidence-backed fundraising campaigns from ArqOne CRM:

- BrandSprk: $300,000 pre-seed fundraising target. Investor briefing: https://www.brandsprk.io/invest
- PlacePulse: $1,500,000 pre-seed fundraising target. Investor briefing: https://www.placepulse.io/invest

Both ventures are in beta; do not describe product usage, traction, paying customers, investment commitments or available features without verified evidence. Keep venture-specific round details, financial forecasts, SAFE terms and investor documents separate. The CRM currently supports only a BrandSprk-specific round at /fundraising.

## Operator experience

Every weekday at 09:00 Asia/Dubai:

1. Review verified high-priority candidates and reply/follow-up tasks.
2. Rank by investment fit and evidence, not mere name recognition.
3. Research/reconfirm thesis, typical first check, investment stage, geography and recipient.
4. Generate ONE venture-specific message (email or LinkedIn) using a verified contact route, two precise personalization facts, a concise differentiated value proposition and the relevant /invest URL.
5. Show a human approval queue with one-click copy, explicit send approval, suppressions and duplicate detection.
6. After actual sending, log provider evidence and schedule 5- and 10-business-day review tasks. Follow-ups must remain drafts until approved.
7. Stop sequences on reply, decline, opt-out, referral, bounced email, or conflict; never automatically restart.
8. Record investor response and next owner action; escalate qualified meetings and diligence to Piero.

No LinkedIn bot sending or scraping; use manual LinkedIn messaging. Zoho sends only after explicit per-message approval using the existing provider adapter and dispatch reconciliation.

## Evidence-weighted qualification

Mark each attribute as Confirmed / Unverified / Conflicting and retain source URL/date:

- Stage/check-size fit: 30 points
- Geography, domicile and investment mandate: 25
- Product/sector thesis: 20
- Warm intro or verified direct recipient: 15
- Recent relevant investments and current fund activity: 10

Automatic hard stop if existing active contact, previously rejected, exclusion criteria, unclear rights to recipient data, existing live send sequence, no verified route, or unresolved Zoho dispatch.

Scores are INTERNAL priority heuristics, not probabilities. 80+ Now, 60–79 Qualify, below 60 Hold, unless a human overrides with recorded reason.

Do not inflate priority of an investor simply because they attended a webinar or backed a superficially adjacent product.

## Message policies

- Select one lead venture based on the investor's thesis; reference the second venture only when a broad AI portfolio discussion is relevant.
- BrandSprk: explain brand/creative decision workflow; pricing and beta limits must match the live investor page.
- PlacePulse: evidence-governed place decisions; avoid claims of owning all source data, guaranteed business impact, underwriting or valuation.
- First email: 90–140 words, one clear CTA, /invest link. No invented prior relationship, attachment, exclusivity, urgency, commitments or traction.
- Page CTA: “Ask Piero's AI a question, or request a founder conversation.” AI must be clearly disclosed as AI; no negotiation/terms/receipt of funds.
- Follow-up 1: 5 Dubai business days after *verified actual* send; follow-up 2: 10 business days. Neither sends automatically.
- Limit pilot to 5 individually approved new outbound messages per business day and at most 2 follow-ups; adjust after reply and bounce metrics.
- Handle sender reputation, opt-outs and applicable outreach laws.

## Proposed data model

Create venture-specific FundraisingRound records with roundKey and issuer/terms; connect multiple InvestorOrganizations and InvestorContacts through independent InvestorRoutes.

InvestorRoute: ventureId, investorId, ownerId, priority, status, thesisEvidence, checkSizeRange, regionFit, verificationAt, sourceLinks, sendEligibility, verifiedEmail, introOwner, nextActionAt, suppressReason, lastApprovedDraft, referralToken, outcome.

Investment terms, commitment and cash flow must be recorded independently per venture and supported by dated evidence. Do not merge them into Sales Opportunity revenue.

Public repository should hold only schema, code and synthetic tests; real investor lists, contact emails and activity history stay in protected database.

## Virtual Piero integration (critical)

1. Generate an opaque, non-PII campaign token per outreach link; a visit is not proof of identity or intent.
2. On /invest show venture-specific briefing, AI disclosure and direct founder CTA.
3. With visitor notice and consent, capture investor contact request (name, organization, work email, venture, message, consent); validate and rate-limit, then create a CRM inbound investor event with idempotency key and source/campaign token.
4. Record engagement events (page visit, AI briefing started, contact requested) without treating them as replies, sends or investment intent. No raw private Q&A transcripts stored without clear permission and retention policy.
5. BrandSprk has an investor contact form today; PlacePulse currently has a mailto request path and client-side voice briefing, so needs a server-backed contact request path before automatic CRM capture.
6. Expose an internal notice to Piero on verified investor inquiry; assistant does not pitch securities or negotiate.

## Launch sequence

Release A (no schema changes): Add explicit list of campaign links/one-venture draft templates; check duplicate/outreach state; include selected investor CTA; make review queue more usable. Continue manually confirmed sends and follow-ups.

Release B (additive migration, approved): Multiple FundraisingRound records; shared investor directory with cross-venture duplicate safeguards, scoring evidence and separate pipelines.

Release C (consented inbound integration): Wire both /invest pages' verified contact submissions and approved engagement events into CRM via authenticated, rate-limited webhook and audit logs. Confirm PlacePulse contact conversion before launching large-scale outreach.

Release D (separate privacy gate): Review read-only mailbox integration PR #7 and approve limited, metadata-only inbound sync, retention, operator access and rollback. Only after this can response detection be automated. No auto-follow-up until provider reconciliation is proven.

## Acceptance criteria

- Two ventures and separate round targets, stage states, linked contacts, fundraising totals and investor materials.
- No duplicated sends to same investor across campaigns without explicit human override.
- No outbound send without confirmed contact and review of exact recipient, subject, message and venture.
- No investor reply or cash inferred from website events, chat sessions or historical imports.
- Operator sees ordered daily queue, drafts, owner, due date, last evidence, send/response status.
- Follow-ups stop and tasks close immediately when a reply/decline/opt-out is recorded.
- Feature flags default OFF in previews; preview builds never migrate shared production DB.
- Integration tests cover duplicate contacts, two concurrent ventures, double-click sending, uncertain Zoho delivery, delayed replies, route holds, consent and data-retention.
- Production deployment only after approved migration, privacy review, verified CI and authenticated smoke tests.

## Existing capabilities and gaps verified 24 November 2026

- Current ArqOne CRM fundraising module: BrandSprk only; reviewed Zoho initial-send with idempotency; manual logging; 5/10 business-day tasks; no scheduler or enabled mailbox monitor.
- BrandSprk investor page: $300k target, optional Piero AI voice/text briefing, direct investor contact form.
- PlacePulse repo investor page: $1.5M target, optional Piero AI voice briefing; mailto direct request, no equivalent CRM contact submission form in the page inspected.
- PlacePulse live page availability was not independently confirmed through the public browser; verified repository implementation only.

## Outreach outcomes tracked

Qualified candidates, approved sends, delivered/uncertain sends, replies, positive replies, founder calls, diligence, terms discussion, evidence-backed commitments, received funds. Report by venture and source with counts, not fabricated rates. Identify stale records and existing contacts before any new campaign.
