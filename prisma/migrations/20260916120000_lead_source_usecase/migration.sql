-- Additive, production-safe migration. No drops, no data loss.
--
-- 1. Structured lead source: sourceType (controlled enum-like string) +
--    sourceDetail (free text, e.g. "ATM Dubai 2026"), replacing the flat
--    Lead.source for new records. Lead.source is kept as-is for history.
-- 2. useCase / context on Lead and Opportunity — a suggested-but-extensible
--    string shared across every product (PlacePulse, Plymio, AI Navigator,
--    Advisory), never a product-specific column on Account/Contact.

-- Lead: new columns
ALTER TABLE "Lead" ADD COLUMN "sourceType" TEXT;
ALTER TABLE "Lead" ADD COLUMN "sourceDetail" TEXT;
ALTER TABLE "Lead" ADD COLUMN "useCase" TEXT;

-- Opportunity: new column
ALTER TABLE "Opportunity" ADD COLUMN "useCase" TEXT;

-- Backfill: known legacy Lead.source values map directly onto the new
-- sourceType enum (their value sets already coincide). Anything else
-- (custom/free text, or null) is left untouched — nothing is destroyed or
-- guessed at.
UPDATE "Lead"
SET "sourceType" = "source"
WHERE "source" IN ('REFERRAL', 'EVENT', 'INBOUND', 'OUTBOUND', 'LINKEDIN', 'PARTNER', 'OTHER');

-- Indexes to support ATM-style reporting (leads by event source, use-case
-- distribution, etc.) without a BI layer.
CREATE INDEX "Lead_sourceType_idx" ON "Lead" ("sourceType");
CREATE INDEX "Lead_sourceDetail_idx" ON "Lead" ("sourceDetail");
CREATE INDEX "Lead_useCase_idx" ON "Lead" ("useCase");
CREATE INDEX "Opportunity_useCase_idx" ON "Opportunity" ("useCase");
