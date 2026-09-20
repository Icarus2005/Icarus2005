-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "providerMessageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Activity_idempotencyKey_key" ON "Activity"("idempotencyKey");

