-- Reversal for 20260918032440_foundation_cleanup_sprint01.
-- Not run automatically by Prisma Migrate — kept here for reviewability and
-- manual rollback only. Safe to run because every added column is nullable
-- or has a default, so nothing here can lose data other than the new
-- columns/table themselves.

ALTER TABLE "AccountProduct" DROP CONSTRAINT IF EXISTS "AccountProduct_accountId_fkey";
ALTER TABLE "AccountProduct" DROP CONSTRAINT IF EXISTS "AccountProduct_productKey_fkey";
ALTER TABLE "Lead" DROP CONSTRAINT IF EXISTS "Lead_accountId_fkey";
ALTER TABLE "Lead" DROP CONSTRAINT IF EXISTS "Lead_primaryContactId_fkey";
ALTER TABLE "Contact" DROP CONSTRAINT IF EXISTS "Contact_referredById_fkey";

DROP TABLE IF EXISTS "AccountProduct";

DROP INDEX IF EXISTS "Contact_referredById_idx";
DROP INDEX IF EXISTS "Contact_relationshipStrength_idx";
DROP INDEX IF EXISTS "Lead_accountId_idx";
DROP INDEX IF EXISTS "Lead_primaryContactId_idx";
DROP INDEX IF EXISTS "Opportunity_type_idx";

ALTER TABLE "Contact"
  DROP COLUMN IF EXISTS "acquisitionPath",
  DROP COLUMN IF EXISTS "referredById",
  DROP COLUMN IF EXISTS "relationshipStrength",
  DROP COLUMN IF EXISTS "sourceDetail",
  DROP COLUMN IF EXISTS "sourceType";

ALTER TABLE "Lead"
  DROP COLUMN IF EXISTS "accountId",
  DROP COLUMN IF EXISTS "primaryContactId";

ALTER TABLE "Opportunity"
  DROP COLUMN IF EXISTS "type";

ALTER TABLE "OpportunityContact"
  DROP COLUMN IF EXISTS "isPrimary",
  DROP COLUMN IF EXISTS "stakeholderRole";
