-- Sprint 4A is additive and metadata-only. No existing CRM table is altered.

-- CreateTable
CREATE TABLE "MailboxConnection" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountKey" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "dataRegion" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "secretReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailboxConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailThread" (
    "id" TEXT NOT NULL,
    "mailboxConnectionId" TEXT NOT NULL,
    "providerThreadId" TEXT,
    "subjectKey" TEXT,
    "latestMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "mailboxConnectionId" TEXT NOT NULL,
    "threadId" TEXT,
    "externalMessageId" TEXT NOT NULL,
    "providerReplyToMessageId" TEXT,
    "internetMessageId" TEXT,
    "inReplyTo" TEXT,
    "referencesJson" JSONB NOT NULL,
    "direction" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toJson" JSONB NOT NULL,
    "ccJson" JSONB NOT NULL,
    "subject" TEXT,
    "providerSentAt" TIMESTAMP(3) NOT NULL,
    "providerReceivedAt" TIMESTAMP(3),
    "folderKey" TEXT,
    "syncState" TEXT NOT NULL DEFAULT 'VERIFIED',
    "rawPayloadHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSyncCursor" (
    "id" TEXT NOT NULL,
    "mailboxConnectionId" TEXT NOT NULL,
    "folderKey" TEXT NOT NULL,
    "receivedBefore" TIMESTAMP(3),
    "overlapFrom" TIMESTAMP(3),
    "pageToken" TEXT,
    "lastSuccessfulAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSyncCursor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MailboxConnection_provider_providerAccountKey_key" ON "MailboxConnection"("provider", "providerAccountKey");

-- CreateIndex
CREATE INDEX "MailboxConnection_enabled_idx" ON "MailboxConnection"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "EmailThread_mailboxConnectionId_providerThreadId_key" ON "EmailThread"("mailboxConnectionId", "providerThreadId");

-- CreateIndex
CREATE INDEX "EmailThread_latestMessageAt_idx" ON "EmailThread"("latestMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_mailboxConnectionId_externalMessageId_key" ON "EmailMessage"("mailboxConnectionId", "externalMessageId");

-- CreateIndex
CREATE INDEX "EmailMessage_internetMessageId_idx" ON "EmailMessage"("internetMessageId");

-- CreateIndex
CREATE INDEX "EmailMessage_threadId_idx" ON "EmailMessage"("threadId");

-- CreateIndex
CREATE INDEX "EmailMessage_fromAddress_idx" ON "EmailMessage"("fromAddress");

-- CreateIndex
CREATE INDEX "EmailMessage_providerReceivedAt_idx" ON "EmailMessage"("providerReceivedAt");

-- CreateIndex
CREATE INDEX "EmailMessage_syncState_idx" ON "EmailMessage"("syncState");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSyncCursor_mailboxConnectionId_folderKey_key" ON "EmailSyncCursor"("mailboxConnectionId", "folderKey");

-- CreateIndex
CREATE INDEX "EmailSyncCursor_lastSuccessfulAt_idx" ON "EmailSyncCursor"("lastSuccessfulAt");

-- AddForeignKey
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_mailboxConnectionId_fkey" FOREIGN KEY ("mailboxConnectionId") REFERENCES "MailboxConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_mailboxConnectionId_fkey" FOREIGN KEY ("mailboxConnectionId") REFERENCES "MailboxConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "EmailThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSyncCursor" ADD CONSTRAINT "EmailSyncCursor_mailboxConnectionId_fkey" FOREIGN KEY ("mailboxConnectionId") REFERENCES "MailboxConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
