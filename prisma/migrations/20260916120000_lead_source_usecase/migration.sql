-- Additive, production-safe migration. No drops, no data loss.
--
-- 1. Structured lead source: sourceType (controlled enum-like string) +
--    sourceDetail (free text, e.g. "ATM Dubai 2026"), replacing the flat
--    Lead.source for new records. Lead.source is kept as-is for history.
-- 2. useCase / context on Lead and Opportunity — a suggested-but-extensible
--    string shared across every product (PlacePulse, Plymio, AI Navigator,
--    Advisory), never a product-specific column on Account/Contact.

-- Lead: new columns
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "sourceType" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "sourceDetail" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "useCase" TEXT;

-- Opportunity: new column
ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "useCase" TEXT;

-- Backfill: known legacy Lead.source values map directly onto the new
-- sourceType enum (their value sets already coincide). Anything else
-- (custom/free text, or null) is left untouched — nothing is destroyed or
-- guessed at. Defensive: only fills sourceType where it is still unset, so
-- a re-run (or a run after a partial prior apply) never overwrites a value
-- that was already populated.
UPDATE "Lead"
SET "sourceType" = "source"
WHERE "source" IN ('REFERRAL', 'EVENT', 'INBOUND', 'OUTBOUND', 'LINKEDIN', 'PARTNER', 'OTHER', 'WEBSITE', 'EXISTING_RELATIONSHIP')
  AND "sourceType" IS NULL;

-- Indexes to support ATM-style reporting (leads by event source, use-case
-- distribution, etc.) without a BI layer.
CREATE INDEX IF NOT EXISTS "Lead_sourceType_idx" ON "Lead" ("sourceType");
CREATE INDEX IF NOT EXISTS "Lead_sourceDetail_idx" ON "Lead" ("sourceDetail");
CREATE INDEX IF NOT EXISTS "Lead_useCase_idx" ON "Lead" ("useCase");
CREATE INDEX IF NOT EXISTS "Opportunity_useCase_idx" ON "Opportunity" ("useCase");
