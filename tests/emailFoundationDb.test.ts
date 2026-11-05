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
        await prisma!.emailMessage.deleteMany({ where: { mailboxConnectionId: connection.id } });
        await prisma!.mailboxConnection.delete({ where: { id: connection.id } });
      }
    });

    test("mailbox and thread deletion cannot cascade away message history", async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const connection = await prisma!.mailboxConnection.create({
        data: {
          provider: "OTHER",
          providerAccountKey: `history-${suffix}`,
          emailAddress: `history-${suffix}@example.test`,
        },
      });
      const thread = await prisma!.emailThread.create({
        data: {
          mailboxConnectionId: connection.id,
          providerThreadId: `thread-${suffix}`,
        },
      });
      const message = await prisma!.emailMessage.create({
        data: {
          mailboxConnectionId: connection.id,
          threadId: thread.id,
          externalMessageId: `message-${suffix}`,
          referencesJson: [],
          direction: "INBOUND",
          fromAddress: "contact@example.test",
          toJson: [connection.emailAddress],
          ccJson: [],
          providerSentAt: new Date(),
        },
      });

      try {
        await assert.rejects(
          prisma!.mailboxConnection.delete({ where: { id: connection.id } }),
          /Foreign key constraint/,
        );
        await assert.rejects(
          prisma!.emailThread.delete({ where: { id: thread.id } }),
          /Foreign key constraint/,
        );
        assert.ok(await prisma!.emailMessage.findUnique({ where: { id: message.id } }));
      } finally {
        await prisma!.emailMessage.delete({ where: { id: message.id } });
        await prisma!.emailThread.delete({ where: { id: thread.id } });
        await prisma!.mailboxConnection.delete({ where: { id: connection.id } });
      }
    });

    test("a message cannot link to a thread owned by another mailbox", async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const [first, second] = await Promise.all([
        prisma!.mailboxConnection.create({
          data: {
            provider: "OTHER",
            providerAccountKey: `thread-owner-${suffix}`,
            emailAddress: `owner-${suffix}@example.test`,
          },
        }),
        prisma!.mailboxConnection.create({
          data: {
            provider: "OTHER",
            providerAccountKey: `message-owner-${suffix}`,
            emailAddress: `message-${suffix}@example.test`,
          },
        }),
      ]);
      const thread = await prisma!.emailThread.create({
        data: {
          mailboxConnectionId: first.id,
          providerThreadId: `thread-${suffix}`,
        },
      });

      try {
        await assert.rejects(
          prisma!.emailMessage.create({
            data: {
              mailboxConnectionId: second.id,
              threadId: thread.id,
              externalMessageId: `cross-mailbox-${suffix}`,
              referencesJson: [],
              direction: "INBOUND",
              fromAddress: "contact@example.test",
              toJson: [second.emailAddress],
              ccJson: [],
              providerSentAt: new Date(),
            },
          }),
          /Foreign key constraint/,
        );
        assert.equal(
          await prisma!.emailMessage.count({
            where: { externalMessageId: `cross-mailbox-${suffix}` },
          }),
          0,
        );
      } finally {
        await prisma!.emailThread.delete({ where: { id: thread.id } });
        await prisma!.mailboxConnection.deleteMany({ where: { id: { in: [first.id, second.id] } } });
      }
    });
  },
);
