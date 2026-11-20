-- Sprint 4B remains additive and metadata-only. No message bodies, snippets,
-- attachments, raw headers or raw provider payloads are stored.

ALTER TABLE "EmailMessage"
  ADD COLUMN "contactId" TEXT,
  ADD COLUMN "accountId" TEXT,
  ADD COLUMN "matchState" TEXT NOT NULL DEFAULT 'UNMATCHED',
  ADD COLUMN "matchBasis" TEXT,
  ADD COLUMN "replyState" TEXT NOT NULL DEFAULT 'NOT_A_REPLY',
  ADD COLUMN "replyBasis" TEXT,
  ADD COLUMN "replyToMessageId" TEXT;

ALTER TABLE "EmailSyncCursor"
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextRetryAt" TIMESTAMP(3),
  ADD COLUMN "lastRunMessageCount" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "EmailMessage_id_mailboxConnectionId_key"
  ON "EmailMessage"("id", "mailboxConnectionId");
CREATE INDEX "EmailMessage_contactId_providerSentAt_idx"
  ON "EmailMessage"("contactId", "providerSentAt");
CREATE INDEX "EmailMessage_accountId_providerSentAt_idx"
  ON "EmailMessage"("accountId", "providerSentAt");
CREATE INDEX "EmailMessage_matchState_providerReceivedAt_idx"
  ON "EmailMessage"("matchState", "providerReceivedAt");
CREATE INDEX "EmailMessage_replyState_idx"
  ON "EmailMessage"("replyState");

ALTER TABLE "EmailMessage"
  ADD CONSTRAINT "EmailMessage_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailMessage"
  ADD CONSTRAINT "EmailMessage_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailMessage"
  ADD CONSTRAINT "EmailMessage_replyToMessageId_mailboxConnectionId_fkey"
  FOREIGN KEY ("replyToMessageId", "mailboxConnectionId")
  REFERENCES "EmailMessage"("id", "mailboxConnectionId") ON DELETE RESTRICT ON UPDATE CASCADE;
