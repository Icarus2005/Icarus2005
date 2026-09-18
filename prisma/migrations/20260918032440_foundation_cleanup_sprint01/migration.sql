-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "acquisitionPath" TEXT,
ADD COLUMN     "referredById" TEXT,
ADD COLUMN     "relationshipStrength" TEXT,
ADD COLUMN     "sourceDetail" TEXT,
ADD COLUMN     "sourceType" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "accountId" TEXT,
ADD COLUMN     "primaryContactId" TEXT;

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "type" TEXT;

-- AlterTable
ALTER TABLE "OpportunityContact" ADD COLUMN     "isPrimary" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stakeholderRole" TEXT;

-- CreateTable
CREATE TABLE "AccountProduct" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "relationshipState" TEXT NOT NULL DEFAULT 'PROSPECT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountProduct_productKey_idx" ON "AccountProduct"("productKey");

-- CreateIndex
CREATE UNIQUE INDEX "AccountProduct_accountId_productKey_key" ON "AccountProduct"("accountId", "productKey");

-- CreateIndex
CREATE INDEX "Contact_referredById_idx" ON "Contact"("referredById");

-- CreateIndex
CREATE INDEX "Contact_relationshipStrength_idx" ON "Contact"("relationshipStrength");

-- CreateIndex
CREATE INDEX "Lead_accountId_idx" ON "Lead"("accountId");

-- CreateIndex
CREATE INDEX "Lead_primaryContactId_idx" ON "Lead"("primaryContactId");

-- CreateIndex
CREATE INDEX "Opportunity_type_idx" ON "Opportunity"("type");

-- AddForeignKey
ALTER TABLE "AccountProduct" ADD CONSTRAINT "AccountProduct_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountProduct" ADD CONSTRAINT "AccountProduct_productKey_fkey" FOREIGN KEY ("productKey") REFERENCES "Product"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_primaryContactId_fkey" FOREIGN KEY ("primaryContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
