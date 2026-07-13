-- CreateTable
CREATE TABLE "Product" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Pipeline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "productKey" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Pipeline_productKey_fkey" FOREIGN KEY ("productKey") REFERENCES "Product" ("key") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PipelineStage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "defaultProbability" INTEGER NOT NULL DEFAULT 10,
    "isWon" BOOLEAN NOT NULL DEFAULT false,
    "isLost" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "pipelineId" TEXT NOT NULL,
    CONSTRAINT "PipelineStage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Opportunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "product" TEXT NOT NULL DEFAULT 'UNASSIGNED',
    "pipelineId" TEXT,
    "stageId" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'IDENTIFIED',
    "stageChangedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "value" REAL,
    "probability" INTEGER,
    "markets" TEXT NOT NULL DEFAULT 'AE',
    "forecastCategory" TEXT NOT NULL DEFAULT 'PIPELINE',
    "healthStatus" TEXT NOT NULL DEFAULT 'ON_TRACK',
    "nextAction" TEXT,
    "nextActionDate" DATETIME,
    "expectedCloseDate" DATETIME,
    "closedAt" DATETIME,
    "decisionMakerEngaged" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "ownerId" TEXT,
    "accountId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Opportunity_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Opportunity_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "PipelineStage" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Opportunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "TeamMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Opportunity_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Opportunity" ("accountId", "closedAt", "createdAt", "decisionMakerEngaged", "expectedCloseDate", "id", "markets", "name", "notes", "ownerId", "probability", "stage", "updatedAt", "value", "product") SELECT "accountId", "closedAt", "createdAt", "decisionMakerEngaged", "expectedCloseDate", "id", "markets", "name", "notes", "ownerId", "probability", "stage", "updatedAt", "value", COALESCE("type", 'UNASSIGNED') FROM "Opportunity";
DROP TABLE "Opportunity";
ALTER TABLE "new_Opportunity" RENAME TO "Opportunity";
CREATE INDEX "Opportunity_product_idx" ON "Opportunity"("product");
CREATE INDEX "Opportunity_stageId_idx" ON "Opportunity"("stageId");
CREATE INDEX "Opportunity_ownerId_idx" ON "Opportunity"("ownerId");
CREATE INDEX "Opportunity_accountId_idx" ON "Opportunity"("accountId");
CREATE TABLE "new_Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "markets" TEXT NOT NULL DEFAULT 'AE',
    "sector" TEXT,
    "primaryProduct" TEXT NOT NULL DEFAULT 'UNASSIGNED',
    "secondaryProducts" TEXT,
    "digitalMaturity" TEXT,
    "source" TEXT,
    "salesMotion" TEXT,
    "tags" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "score" INTEGER,
    "estimatedValue" REAL,
    "nextAction" TEXT,
    "nextActionDate" DATETIME,
    "lastActivityAt" DATETIME,
    "notes" TEXT,
    "convertedOpportunityId" TEXT,
    "ownerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "TeamMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Lead" ("company", "convertedOpportunityId", "createdAt", "digitalMaturity", "email", "id", "markets", "name", "notes", "ownerId", "phone", "score", "sector", "source", "status", "tags", "title", "updatedAt", "primaryProduct") SELECT "company", "convertedOpportunityId", "createdAt", "digitalMaturity", "email", "id", "markets", "name", "notes", "ownerId", "phone", "score", "sector", "source", "status", "tags", "title", "updatedAt", COALESCE("productInterest", 'UNASSIGNED') FROM "Lead";
DROP TABLE "Lead";
ALTER TABLE "new_Lead" RENAME TO "Lead";
CREATE INDEX "Lead_primaryProduct_idx" ON "Lead"("primaryProduct");
CREATE INDEX "Lead_status_idx" ON "Lead"("status");
CREATE INDEX "Lead_ownerId_idx" ON "Lead"("ownerId");
CREATE TABLE "new_Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "country" TEXT NOT NULL DEFAULT 'AE',
    "sector" TEXT NOT NULL DEFAULT 'PRIVATE',
    "size" TEXT,
    "tier" TEXT,
    "locationsCount" INTEGER,
    "pastEngagements" TEXT,
    "website" TEXT,
    "description" TEXT,
    "ownerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "TeamMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Account" ("country", "createdAt", "description", "id", "industry", "locationsCount", "name", "pastEngagements", "sector", "size", "updatedAt", "website") SELECT "country", "createdAt", "description", "id", "industry", "locationsCount", "name", "pastEngagements", "sector", "size", "updatedAt", "website" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE UNIQUE INDEX "Account_name_key" ON "Account"("name");
CREATE INDEX "Account_ownerId_idx" ON "Account"("ownerId");
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "dueDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "product" TEXT,
    "leadId" TEXT,
    "accountId" TEXT,
    "contactId" TEXT,
    "opportunityId" TEXT,
    "ownerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "TeamMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("accountId", "contactId", "createdAt", "dueDate", "id", "leadId", "notes", "opportunityId", "ownerId", "status", "title", "updatedAt") SELECT "accountId", "contactId", "createdAt", "dueDate", "id", "leadId", "notes", "opportunityId", "ownerId", "status", "title", "updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_product_idx" ON "Task"("product");
CREATE INDEX "Task_status_idx" ON "Task"("status");
CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");
CREATE TABLE "new_Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "notes" TEXT,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "product" TEXT,
    "ownerId" TEXT,
    "leadId" TEXT,
    "accountId" TEXT,
    "contactId" TEXT,
    "opportunityId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Activity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "TeamMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Activity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Activity_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Activity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Activity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Activity" ("accountId", "contactId", "createdAt", "date", "id", "leadId", "notes", "opportunityId", "subject", "type", "updatedAt") SELECT "accountId", "contactId", "createdAt", "date", "id", "leadId", "notes", "opportunityId", "subject", "type", "updatedAt" FROM "Activity";
DROP TABLE "Activity";
ALTER TABLE "new_Activity" RENAME TO "Activity";
CREATE INDEX "Activity_product_idx" ON "Activity"("product");
CREATE INDEX "Activity_date_idx" ON "Activity"("date");
PRAGMA foreign_key_check("Opportunity");
PRAGMA foreign_key_check("Lead");
PRAGMA foreign_key_check("Account");
PRAGMA foreign_key_check("Task");
PRAGMA foreign_key_check("Activity");
PRAGMA foreign_keys=ON;

-- CreateIndex
CREATE INDEX "Pipeline_productKey_idx" ON "Pipeline"("productKey");

-- CreateIndex
CREATE INDEX "PipelineStage_pipelineId_order_idx" ON "PipelineStage"("pipelineId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineStage_pipelineId_key_key" ON "PipelineStage"("pipelineId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_email_key" ON "Contact"("email");

