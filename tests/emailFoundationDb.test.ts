import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";

function isForeignKeyConstraintError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2003";
  }

  return error instanceof Error && /foreign key constraint|violates RESTRICT setting/i.test(error.message);
}

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
        const assertHistoryPreserved = async () => {
          const [preservedConnection, preservedThread, preservedMessage] = await Promise.all([
            prisma!.mailboxConnection.findUnique({ where: { id: connection.id } }),
            prisma!.emailThread.findUnique({ where: { id: thread.id } }),
            prisma!.emailMessage.findUnique({ where: { id: message.id } }),
          ]);
          assert.equal(preservedConnection?.id, connection.id);
          assert.equal(preservedThread?.id, thread.id);
          assert.equal(preservedMessage?.id, message.id);
        };

        await assert.rejects(
          prisma!.mailboxConnection.delete({ where: { id: connection.id } }),
          isForeignKeyConstraintError,
        );
        await assertHistoryPreserved();
        await assert.rejects(
          prisma!.emailThread.delete({ where: { id: thread.id } }),
          isForeignKeyConstraintError,
        );
        await assertHistoryPreserved();
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
          isForeignKeyConstraintError,
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
