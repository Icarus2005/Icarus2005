import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { PrismaClient } from "@prisma/client";

function isExplicitDisposableDatabase(): boolean {
  if (process.env.EMAIL_FOUNDATION_DISPOSABLE_DB_TESTS !== "true") return false;
  const value = process.env.DATABASE_URL;
  if (!value) return false;
  try {
    const url = new URL(value);
    const localHost = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    return localHost && url.pathname.toLowerCase().includes("sprint4a_disposable");
  } catch {
    return false;
  }
}

const runDatabaseTests = isExplicitDisposableDatabase();
const prisma = runDatabaseTests ? new PrismaClient() : null;

describe(
  "Sprint 4A disposable-database schema",
  { skip: !runDatabaseTests && "requires an explicitly named local sprint4a_disposable database" },
  () => {
    after(async () => {
      await prisma?.$disconnect();
    });

    test("connection is disabled by default and message identity is idempotent", async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const connection = await prisma!.mailboxConnection.create({
        data: {
          provider: "OTHER",
          providerAccountKey: `disposable-${suffix}`,
          emailAddress: `mailbox-${suffix}@example.test`,
        },
      });

      try {
        assert.equal(connection.enabled, false);

        const data = {
          mailboxConnectionId: connection.id,
          externalMessageId: `message-${suffix}`,
          internetMessageId: `<${suffix}@example.test>`,
          referencesJson: [],
          direction: "INBOUND",
          fromAddress: "contact@example.test",
          toJson: [connection.emailAddress],
          ccJson: [],
          subject: "Disposable schema verification",
          providerSentAt: new Date(),
        };

        await prisma!.emailMessage.create({ data });
        await assert.rejects(prisma!.emailMessage.create({ data }), /Unique constraint/);

        const count = await prisma!.emailMessage.count({
          where: {
            mailboxConnectionId: connection.id,
            externalMessageId: data.externalMessageId,
          },
        });
        assert.equal(count, 1);
      } finally {
        await prisma!.mailboxConnection.delete({ where: { id: connection.id } });
      }
    });
  },
);
