-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "country" TEXT NOT NULL DEFAULT 'AE',
    "sector" TEXT NOT NULL DEFAULT 'PRIVATE',
    "size" TEXT,
    "locationsCount" INTEGER,
    "pastEngagements" TEXT,
    "website" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Account" ("country", "createdAt", "description", "id", "industry", "locationsCount", "name", "pastEngagements", "sector", "size", "updatedAt", "website") SELECT "country", "createdAt", "description", "id", "industry", "locationsCount", "name", "pastEngagements", "sector", "size", "updatedAt", "website" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
PRAGMA foreign_key_check("Account");
PRAGMA foreign_keys=ON;
