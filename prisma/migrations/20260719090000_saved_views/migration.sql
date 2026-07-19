-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "SavedView_page_idx" ON "SavedView"("page");

-- CreateIndex
CREATE UNIQUE INDEX "SavedView_page_name_key" ON "SavedView"("page", "name");

