-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "fundraisingProspectId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "fundraisingProspectId" TEXT;

-- CreateTable
CREATE TABLE "FundraisingProspect" (
    "id" TEXT NOT NULL,
    "roundKey" TEXT NOT NULL DEFAULT 'brandsprk-preseed-2026',
    "sourceKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "routeType" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "nextAction" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "drafts" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "sourceStatus" TEXT NOT NULL,
    "contactId" TEXT,
    "committedUsd" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "receivedUsd" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "capitalEvidence" TEXT NOT NULL DEFAULT '',
    "firstSentAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3),
    "lastReplyAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundraisingProspect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundraisingDispatch" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'SENDING',
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundraisingDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FundraisingProspect_status_priority_idx" ON "FundraisingProspect"("status", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "FundraisingProspect_roundKey_sourceKey_key" ON "FundraisingProspect"("roundKey", "sourceKey");

-- CreateIndex
CREATE INDEX "FundraisingDispatch_prospectId_state_idx" ON "FundraisingDispatch"("prospectId", "state");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_fundraisingProspectId_fkey" FOREIGN KEY ("fundraisingProspectId") REFERENCES "FundraisingProspect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_fundraisingProspectId_fkey" FOREIGN KEY ("fundraisingProspectId") REFERENCES "FundraisingProspect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundraisingProspect" ADD CONSTRAINT "FundraisingProspect_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundraisingDispatch" ADD CONSTRAINT "FundraisingDispatch_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "FundraisingProspect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Guard unresolved deliveries and capital invariants even outside the application.
CREATE UNIQUE INDEX "FundraisingDispatch_one_unresolved_per_prospect" ON "FundraisingDispatch" ("prospectId") WHERE "state" IN ('SENDING', 'UNCERTAIN');
ALTER TABLE "FundraisingProspect" ADD CONSTRAINT "fundraising_capital_nonnegative" CHECK ("committedUsd" >= 0 AND "receivedUsd" >= 0 AND "receivedUsd" <= "committedUsd");
CREATE INDEX "Activity_fundraisingProspectId_idx" ON "Activity" ("fundraisingProspectId");
CREATE INDEX "Task_fundraisingProspectId_idx" ON "Task" ("fundraisingProspectId");

-- Add only the catalogue and commercial template, never reset existing CRM data.
INSERT INTO "Product" ("key", "name", "description", "active", "displayOrder", "updatedAt") VALUES ('BRANDSPRK','BrandSprk','Brand context and creative decision workflows',true,6,CURRENT_TIMESTAMP) ON CONFLICT ("key") DO NOTHING;
INSERT INTO "Pipeline" ("id","name","productKey","updatedAt") VALUES ('pl_brandsprk','BrandSprk Sales','BRANDSPRK',CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "PipelineStage" ("id","key","name","order","defaultProbability","isWon","isLost","pipelineId") VALUES
('st_brandsprk_identified','IDENTIFIED','Identified',0,5,false,false,'pl_brandsprk'),
('st_brandsprk_qualified','QUALIFIED','Qualified',1,20,false,false,'pl_brandsprk'),
('st_brandsprk_discovery','DISCOVERY','Discovery',2,30,false,false,'pl_brandsprk'),
('st_brandsprk_pilot','PILOT','Pilot / Demo',3,50,false,false,'pl_brandsprk'),
('st_brandsprk_proposal','PROPOSAL','Proposal',4,65,false,false,'pl_brandsprk'),
('st_brandsprk_negotiation','NEGOTIATION','Negotiation',5,80,false,false,'pl_brandsprk'),
('st_brandsprk_closed_won','CLOSED_WON','Closed Won',6,100,true,false,'pl_brandsprk'),
('st_brandsprk_closed_lost','CLOSED_LOST','Closed Lost',7,0,false,true,'pl_brandsprk') ON CONFLICT ("id") DO NOTHING;
