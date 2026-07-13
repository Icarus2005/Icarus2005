/*
  Warnings:

  - You are about to drop the column `region` on the `Lead` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SALES_EXECUTIVE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Opportunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'IDENTIFIED',
    "type" TEXT NOT NULL DEFAULT 'PLACEPULSE',
    "value" REAL,
    "probability" INTEGER,
    "markets" TEXT NOT NULL DEFAULT 'AE',
    "expectedCloseDate" DATETIME,
    "closedAt" DATETIME,
    "decisionMakerEngaged" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "ownerId" TEXT,
    "accountId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Opportunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "TeamMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Opportunity_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Opportunity" ("accountId", "closedAt", "createdAt", "decisionMakerEngaged", "expectedCloseDate", "id", "name", "notes", "probability", "stage", "type", "updatedAt", "value") SELECT "accountId", "closedAt", "createdAt", "decisionMakerEngaged", "expectedCloseDate", "id", "name", "notes", "probability", "stage", "type", "updatedAt", "value" FROM "Opportunity";
DROP TABLE "Opportunity";
ALTER TABLE "new_Opportunity" RENAME TO "Opportunity";
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "dueDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
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
INSERT INTO "new_Task" ("accountId", "contactId", "createdAt", "dueDate", "id", "leadId", "notes", "opportunityId", "status", "title", "updatedAt") SELECT "accountId", "contactId", "createdAt", "dueDate", "id", "leadId", "notes", "opportunityId", "status", "title", "updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE TABLE "new_Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "markets" TEXT NOT NULL DEFAULT 'AE',
    "sector" TEXT,
    "productInterest" TEXT,
    "digitalMaturity" TEXT,
    "source" TEXT,
    "tags" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "score" INTEGER,
    "notes" TEXT,
    "convertedOpportunityId" TEXT,
    "ownerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "TeamMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Lead" ("company", "convertedOpportunityId", "createdAt", "digitalMaturity", "email", "id", "name", "notes", "phone", "productInterest", "score", "sector", "source", "status", "tags", "title", "updatedAt") SELECT "company", "convertedOpportunityId", "createdAt", "digitalMaturity", "email", "id", "name", "notes", "phone", "productInterest", "score", "sector", "source", "status", "tags", "title", "updatedAt" FROM "Lead";
DROP TABLE "Lead";
ALTER TABLE "new_Lead" RENAME TO "Lead";
PRAGMA foreign_key_check("Opportunity");
PRAGMA foreign_key_check("Task");
PRAGMA foreign_key_check("Lead");
PRAGMA foreign_keys=ON;

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_email_key" ON "TeamMember"("email");
