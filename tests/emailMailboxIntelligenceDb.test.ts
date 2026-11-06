import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { MailboxReadError, type MailboxCursor, type MailboxMessagePage, type MailboxReader, type NormalizedMailboxMessage } from "../src/lib/email/mailbox";
import { getMailboxSyncHealthReport } from "../src/lib/email/reporting";
import { synchronizeMailbox } from "../src/lib/email/synchronization";

function isExplicitDisposableDatabase(): boolean {
  if (process.env.EMAIL_MAILBOX_INTELLIGENCE_DISPOSABLE_DB_TESTS !== "true") return false;
  const value = process.env.DATABASE_URL;
  if (!value) return false;
  try {
    const url = new URL(value);
    return ["127.0.0.1", "localhost"].includes(url.hostname)
      && url.pathname.toLowerCase().includes("sprint4b_disposable");
  } catch {
    return false;
  }
}

const runDatabaseTests = isExplicitDisposableDatabase();
const prisma = runDatabaseTests ? new PrismaClient() : null;
const enabledEnvironment = { EMAIL_READ_SYNC_ENABLED: "true" };

function message(overrides: Partial<NormalizedMailboxMessage> = {}): NormalizedMailboxMessage {
  return {
    provider: "ZOHO",
    providerAccountKey: "zoho-account",
    externalMessageId: "message-1",
    providerThreadId: null,
    providerReplyToMessageId: null,
    internetMessageId: "message-1@example.test",
    inReplyTo: null,
    references: [],
    direction: "INBOUND",
    fromAddress: "contact@example.test",
    toAddresses: ["mailbox@example.test"],
    ccAddresses: [],
    subject: "Metadata only",
    sentAt: new Date("2026-11-01T08:00:00.000Z"),
    receivedAt: new Date("2026-11-01T08:00:01.000Z"),
    folderKey: "inbox",
    ...overrides,
  };
}

class StaticReader implements MailboxReader {
  listCalls = 0;
  metadataCalls = 0;

  constructor(
    private readonly messages: NormalizedMailboxMessage[],
    private readonly listError: Error | null = null,
  ) {}

  async listMessages(_cursor: MailboxCursor): Promise<MailboxMessagePage> {
    this.listCalls += 1;
    if (this.listError) throw this.listError;
    return { messages: this.messages, nextCursor: null };
  }

  async getMessageMetadata(externalMessageId: string): Promise<NormalizedMailboxMessage> {
    this.metadataCalls += 1;
    const result = this.messages.find((item) => item.externalMessageId === externalMessageId);
    if (!result) throw new Error("Missing mock metadata");
    return result;
  }
}

async function removeMailbox(connectionId: string) {
  await prisma!.emailMessage.updateMany({ where: { mailboxConnectionId: connectionId }, data: { replyToMessageId: null } });
  await prisma!.emailMessage.deleteMany({ where: { mailboxConnectionId: connectionId } });
  await prisma!.emailThread.deleteMany({ where: { mailboxConnectionId: connectionId } });
  await prisma!.mailboxConnection.delete({ where: { id: connectionId } });
}

describe(
  "Sprint 4B disposable-database synchronization",
  { skip: !runDatabaseTests && "requires an explicitly named local sprint4b_disposable database" },
  () => {
    after(async () => {
      await prisma?.$disconnect();
    });

    test("ingestion is idempotent, exact-matches Contact/Account and confirms thread/header replies", async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const account = await prisma!.account.create({ data: { name: `Mailbox account ${suffix}` } });
      const contact = await prisma!.contact.create({
        data: {
          accountId: account.id,
          firstName: "Exact",
          lastName: "Contact",
          email: `person-${suffix}@example.test`,
        },
      });
      const connection = await prisma!.mailboxConnection.create({
        data: {
          provider: "ZOHO",
          providerAccountKey: "zoho-account",
          emailAddress: "mailbox@example.test",
          enabled: true,
        },
      });
      const beforeAccount = await prisma!.account.findUniqueOrThrow({ where: { id: account.id } });
      const beforeContact = await prisma!.contact.findUniqueOrThrow({ where: { id: contact.id } });
      const messages = [
        message({
          externalMessageId: `thread-root-${suffix}`,
          providerThreadId: `thread-${suffix}`,
          internetMessageId: `thread-root-${suffix}@example.test`,
          direction: "OUTBOUND",
          fromAddress: connection.emailAddress,
          toAddresses: [contact.email!],
          sentAt: new Date("2026-11-01T08:00:00.000Z"),
        }),
        message({
          externalMessageId: `thread-reply-${suffix}`,
          providerThreadId: `thread-${suffix}`,
          internetMessageId: `thread-reply-${suffix}@example.test`,
          inReplyTo: `thread-root-${suffix}@example.test`,
          fromAddress: contact.email!,
          sentAt: new Date("2026-11-01T09:00:00.000Z"),
        }),
        message({
          externalMessageId: `header-root-${suffix}`,
          internetMessageId: `Case.Root-${suffix}@example.test`,
          direction: "OUTBOUND",
          fromAddress: connection.emailAddress,
          toAddresses: [contact.email!],
          sentAt: new Date("2026-11-01T10:00:00.000Z"),
        }),
        message({
          externalMessageId: `header-reply-${suffix}`,
          internetMessageId: `header-reply-${suffix}@example.test`,
          inReplyTo: `Case.Root-${suffix}@example.test`,
          references: [`Case.Root-${suffix}@example.test`],
          fromAddress: contact.email!,
          sentAt: new Date("2026-11-01T11:00:00.000Z"),
        }),
      ];
      const reader = new StaticReader([...messages].reverse());

      try {
        const first = await synchronizeMailbox({
          prisma: prisma!, connectionId: connection.id, folderKey: "inbox", reader,
          environment: enabledEnvironment, now: new Date("2026-11-06T10:00:00.000Z"),
        });
        const replay = await synchronizeMailbox({
          prisma: prisma!, connectionId: connection.id, folderKey: "inbox", reader,
          environment: enabledEnvironment, now: new Date("2026-11-06T10:31:00.000Z"),
        });
        assert.equal(first.status, "SUCCESS");
        assert.equal(replay.status, "SUCCESS");
        assert.equal(await prisma!.emailMessage.count({ where: { mailboxConnectionId: connection.id } }), 4);

        const stored = await prisma!.emailMessage.findMany({
          where: { mailboxConnectionId: connection.id },
          orderBy: { providerSentAt: "asc" },
        });
        assert.ok(stored.every((item) => item.matchState === "EXACT"));
        assert.ok(stored.every((item) => item.contactId === contact.id && item.accountId === account.id));
        const threadReply = stored.find((item) => item.externalMessageId.startsWith("thread-reply"));
        const headerReply = stored.find((item) => item.externalMessageId.startsWith("header-reply"));
        const threadRoot = stored.find((item) => item.externalMessageId.startsWith("thread-root"));
        const headerRoot = stored.find((item) => item.externalMessageId.startsWith("header-root"));
        assert.equal(threadRoot?.replyState, "NOT_A_REPLY");
        assert.equal(headerRoot?.replyState, "NOT_A_REPLY");
        assert.equal(threadReply?.replyState, "CONFIRMED");
        assert.equal(threadReply?.replyBasis, "PROVIDER_THREAD");
        assert.equal(headerReply?.replyState, "CONFIRMED");
        assert.equal(headerReply?.replyBasis, "IN_REPLY_TO");
        assert.ok(threadReply?.replyToMessageId);
        assert.ok(headerReply?.replyToMessageId);

        const afterAccount = await prisma!.account.findUniqueOrThrow({ where: { id: account.id } });
        const afterContact = await prisma!.contact.findUniqueOrThrow({ where: { id: contact.id } });
        assert.equal(afterAccount.updatedAt.getTime(), beforeAccount.updatedAt.getTime());
        assert.equal(afterContact.updatedAt.getTime(), beforeContact.updatedAt.getTime());
        assert.equal(await prisma!.activity.count({ where: { accountId: account.id } }), 0);
        assert.equal(await prisma!.task.count({ where: { accountId: account.id } }), 0);
        assert.equal(await prisma!.lead.count({ where: { accountId: account.id } }), 0);
        assert.equal(await prisma!.opportunity.count({ where: { accountId: account.id } }), 0);
      } finally {
        await removeMailbox(connection.id);
        await prisma!.account.delete({ where: { id: account.id } });
      }
    });

    test("unknown and duplicate-case addresses stay unmatched or ambiguous and appear in reporting", async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const account = await prisma!.account.create({ data: { name: `Matching account ${suffix}` } });
      const duplicateEmail = `duplicate-${suffix}@example.test`;
      await prisma!.contact.createMany({ data: [
        { accountId: account.id, firstName: "Duplicate", lastName: "One", email: duplicateEmail },
        { accountId: account.id, firstName: "Duplicate", lastName: "Two", email: duplicateEmail.toUpperCase() },
      ] });
      const connection = await prisma!.mailboxConnection.create({
        data: { provider: "ZOHO", providerAccountKey: "zoho-account", emailAddress: "mailbox@example.test", enabled: true },
      });
      const reader = new StaticReader([
        message({ externalMessageId: `unknown-${suffix}`, fromAddress: `unknown-${suffix}@example.test` }),
        message({ externalMessageId: `ambiguous-${suffix}`, fromAddress: duplicateEmail, sentAt: new Date("2026-11-01T09:00:00.000Z") }),
      ]);

      try {
        const result = await synchronizeMailbox({
          prisma: prisma!, connectionId: connection.id, folderKey: "inbox", reader,
          environment: enabledEnvironment, now: new Date("2026-11-06T10:00:00.000Z"),
        });
        assert.equal(result.status, "SUCCESS");
        const states = await prisma!.emailMessage.findMany({
          where: { mailboxConnectionId: connection.id },
          select: { externalMessageId: true, matchState: true, contactId: true, accountId: true },
        });
        assert.equal(states.find((item) => item.externalMessageId.startsWith("unknown"))?.matchState, "UNMATCHED");
        assert.equal(states.find((item) => item.externalMessageId.startsWith("ambiguous"))?.matchState, "AMBIGUOUS");
        assert.ok(states.every((item) => item.contactId === null && item.accountId === null));

        const report = await getMailboxSyncHealthReport(prisma!, new Date("2026-11-06T10:10:00.000Z"));
        const mailbox = report.connections.find((item) => item.id === connection.id);
        assert.equal(mailbox?.health, "HEALTHY");
        assert.equal(mailbox?.unmatched, 1);
        assert.equal(mailbox?.ambiguous, 1);
        assert.equal(report.unmatchedMessages.filter((item) => item.mailboxConnectionId === connection.id).length, 2);
      } finally {
        await removeMailbox(connection.id);
        await prisma!.account.delete({ where: { id: account.id } });
      }
    });

    test("replays mail arriving during a long offset-paginated backfill", async () => {
      const suffix = String(Date.now()) + "-" + Math.random().toString(36).slice(2);
      const connection = await prisma!.mailboxConnection.create({
        data: { provider: "ZOHO", providerAccountKey: "zoho-account", emailAddress: "mailbox@example.test", enabled: true },
      });
      const firstScanAt = new Date("2026-11-06T10:00:00.000Z");
      const messages = [
        message({ externalMessageId: "first-" + suffix, fromAddress: "unknown@example.test",
          sentAt: new Date("2026-11-06T09:55:00.000Z"), receivedAt: new Date("2026-11-06T09:56:00.000Z") }),
        message({ externalMessageId: "second-" + suffix, fromAddress: "unknown@example.test",
          sentAt: new Date("2026-11-06T09:00:00.000Z"), receivedAt: new Date("2026-11-06T09:01:00.000Z") }),
        message({ externalMessageId: "third-" + suffix, fromAddress: "unknown@example.test",
          sentAt: new Date("2026-11-06T08:30:00.000Z"), receivedAt: new Date("2026-11-06T08:31:00.000Z") }),
        message({ externalMessageId: "new-arrival-" + suffix, fromAddress: "unknown@example.test",
          sentAt: new Date("2026-11-06T10:30:00.000Z"), receivedAt: new Date("2026-11-06T10:31:00.000Z") }),
      ];
      let listCalls = 0;
      const reader: MailboxReader = {
        async listMessages(cursor: MailboxCursor): Promise<MailboxMessagePage> {
          listCalls += 1;
          if (listCalls === 1) {
            assert.equal(cursor.pageToken, undefined);
            return { messages: messages.slice(0, 2), nextCursor: { ...cursor, pageToken: "3" } };
          }
          if (listCalls === 2) {
            assert.equal(cursor.pageToken, "3");
            // The new arrival shifted the list offset and repeated message #2.
            return { messages: [messages[1], messages[2]], nextCursor: null };
          }
          assert.equal(cursor.pageToken, undefined);
          const cutoff = new Date(cursor.overlapFrom!);
          return {
            messages: [messages[3], messages[0]].filter((item) => (item.receivedAt ?? item.sentAt) >= cutoff),
            nextCursor: null,
          };
        },
        async getMessageMetadata(id: string): Promise<NormalizedMailboxMessage> {
          const found = messages.find((item) => item.externalMessageId === id);
          if (!found) throw new Error("Unknown mock message");
          return found;
        },
      };

      try {
        const first = await synchronizeMailbox({
          prisma: prisma!, connectionId: connection.id, folderKey: "inbox", reader,
          environment: enabledEnvironment, now: firstScanAt,
        });
        assert.equal(first.status, "SUCCESS");
        const pending = await prisma!.emailSyncCursor.findUniqueOrThrow({
          where: { mailboxConnectionId_folderKey: { mailboxConnectionId: connection.id, folderKey: "inbox" } },
        });
        assert.equal(pending.pageToken, "3");
        assert.equal(pending.receivedBefore?.toISOString(), firstScanAt.toISOString());

        const second = await synchronizeMailbox({
          prisma: prisma!, connectionId: connection.id, folderKey: "inbox", reader,
          environment: enabledEnvironment, now: new Date("2026-11-06T12:00:00.000Z"),
        });
        assert.equal(second.status, "SUCCESS");
        const complete = await prisma!.emailSyncCursor.findUniqueOrThrow({
          where: { mailboxConnectionId_folderKey: { mailboxConnectionId: connection.id, folderKey: "inbox" } },
        });
        // Advancing from completion time instead would silently lose the arrival at 10:30.
        assert.equal(complete.overlapFrom?.toISOString(), "2026-11-06T09:00:00.000Z");

        const third = await synchronizeMailbox({
          prisma: prisma!, connectionId: connection.id, folderKey: "inbox", reader,
          environment: enabledEnvironment, now: new Date("2026-11-06T12:30:00.000Z"),
        });
        assert.equal(third.status, "SUCCESS");
        assert.equal(await prisma!.emailMessage.count({ where: { mailboxConnectionId: connection.id } }), 4);
        assert.equal(listCalls, 3);
      } finally {
        await removeMailbox(connection.id);
      }
    });

    test("provider outage persists bounded failure state, honors backoff and recovers without duplication", async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const connection = await prisma!.mailboxConnection.create({
        data: { provider: "ZOHO", providerAccountKey: "zoho-account", emailAddress: "mailbox@example.test", enabled: true },
      });
      const outageReader = new StaticReader([], new MailboxReadError("ZOHO_UNAVAILABLE", "mock outage"));
      const recoveryReader = new StaticReader([
        message({ externalMessageId: `recovered-${suffix}`, fromAddress: `unknown-${suffix}@example.test` }),
      ]);
      try {
        const failed = await synchronizeMailbox({
          prisma: prisma!, connectionId: connection.id, folderKey: "inbox", reader: outageReader,
          environment: enabledEnvironment, now: new Date("2026-11-06T10:00:00.000Z"),
        });
        assert.equal(failed.status, "FAILED");
        if (failed.status === "FAILED") assert.equal(failed.errorCode, "ZOHO_UNAVAILABLE");

        const backedOff = await synchronizeMailbox({
          prisma: prisma!, connectionId: connection.id, folderKey: "inbox", reader: recoveryReader,
          environment: enabledEnvironment, now: new Date("2026-11-06T10:01:00.000Z"),
        });
        assert.equal(backedOff.status, "BACKOFF");
        assert.equal(recoveryReader.listCalls, 0);

        const recovered = await synchronizeMailbox({
          prisma: prisma!, connectionId: connection.id, folderKey: "inbox", reader: recoveryReader,
          environment: enabledEnvironment, now: new Date("2026-11-06T10:06:00.000Z"),
        });
        assert.equal(recovered.status, "SUCCESS");
        assert.equal(await prisma!.emailMessage.count({ where: { mailboxConnectionId: connection.id } }), 1);
        const cursor = await prisma!.emailSyncCursor.findUniqueOrThrow({
          where: { mailboxConnectionId_folderKey: { mailboxConnectionId: connection.id, folderKey: "inbox" } },
        });
        assert.equal(cursor.consecutiveFailures, 0);
        assert.equal(cursor.lastErrorCode, null);
        assert.equal(cursor.nextRetryAt, null);
        assert.equal(cursor.lastRunMessageCount, 1);
      } finally {
        await removeMailbox(connection.id);
      }
    });

    test("Sprint 4B schema contains no body, snippet, attachment or raw-header columns", async () => {
      const columns = await prisma!.$queryRaw<Array<{ table_name: string; column_name: string }>>`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('MailboxConnection', 'EmailThread', 'EmailMessage', 'EmailSyncCursor')
      `;
      const forbidden = /body|snippet|attachment|rawheader|raw_header|payloadjson|raw_payload/i;
      assert.deepEqual(columns.filter((column) => forbidden.test(column.column_name)), []);
    });
  },
);
