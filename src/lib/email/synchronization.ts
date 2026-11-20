import type { Prisma, PrismaClient } from "@prisma/client";
import { matchContactByExactEmail } from "./contactMatching";
import { getEmailFeatureFlags } from "./featureFlags";
import {
  MailboxReadError,
  type MailboxCursor,
  type MailboxReader,
  type NormalizedMailboxMessage,
} from "./mailbox";
import { normalizeEmailAddress } from "./normalization";
import { detectReplyEvidence, type StoredMessageEvidence } from "./replyEvidence";
import {
  getMailboxSyncConfig,
  initialLookbackFrom,
  nextOverlapFrom,
  nextRetryAt,
  type MailboxSyncConfig,
} from "./syncConfig";

export type MailboxSyncResult =
  | { status: "DISABLED"; processed: 0; reason: "FEATURE_FLAG" | "CONNECTION_DISABLED" }
  | { status: "BACKOFF"; processed: 0; nextRetryAt: Date }
  | { status: "SUCCESS"; processed: number; pages: number }
  | { status: "FAILED"; processed: number; errorCode: string; nextRetryAt: Date };

type SynchronizeMailboxInput = {
  prisma: PrismaClient;
  connectionId: string;
  folderKey: string;
  reader: MailboxReader;
  environment?: Readonly<Record<string, string | undefined>>;
  now?: Date;
  config?: MailboxSyncConfig;
};

function counterpartyAddresses(message: NormalizedMailboxMessage, mailboxAddress: string): string[] {
  if (message.direction === "INBOUND") return [message.fromAddress];
  const mailbox = normalizeEmailAddress(mailboxAddress);
  return [...new Set([...message.toAddresses, ...message.ccAddresses])]
    .filter((address) => normalizeEmailAddress(address) !== mailbox);
}

async function exactRelationshipMatch(
  tx: Prisma.TransactionClient,
  message: NormalizedMailboxMessage,
  mailboxAddress: string,
) {
  const addresses = counterpartyAddresses(message, mailboxAddress);
  if (addresses.length !== 1) {
    return {
      matchState: addresses.length > 1 ? "AMBIGUOUS" : "UNMATCHED",
      matchBasis: null,
      contactId: null,
      accountId: null,
    };
  }

  const contacts = await tx.contact.findMany({
    where: { email: { equals: addresses[0], mode: "insensitive" } },
    select: { id: true, accountId: true, email: true },
  });
  const result = matchContactByExactEmail(addresses[0], contacts);
  if (result.status !== "MATCHED") {
    return {
      matchState: result.status,
      matchBasis: null,
      contactId: null,
      accountId: null,
    };
  }
  return {
    matchState: "EXACT",
    matchBasis: result.basis,
    contactId: result.contactId,
    accountId: result.accountId,
  };
}

function replyWhere(message: NormalizedMailboxMessage): Prisma.EmailMessageWhereInput[] {
  const conditions: Prisma.EmailMessageWhereInput[] = [];
  if (message.providerThreadId) conditions.push({ thread: { providerThreadId: message.providerThreadId } });
  const headerIds = [message.inReplyTo, ...message.references].filter((value): value is string => Boolean(value));
  if (headerIds.length > 0) conditions.push({ internetMessageId: { in: headerIds } });
  if (message.providerReplyToMessageId) conditions.push({ externalMessageId: message.providerReplyToMessageId });
  return conditions;
}

async function ingestMessage(
  prisma: PrismaClient,
  connection: { id: string; provider: string; providerAccountKey: string; emailAddress: string },
  message: NormalizedMailboxMessage,
): Promise<void> {
  if (message.provider !== connection.provider || message.providerAccountKey !== connection.providerAccountKey) {
    throw new MailboxReadError("PROVIDER_IDENTITY_MISMATCH", "Provider metadata does not match the mailbox connection", false);
  }

  await prisma.$transaction(async (tx) => {
    const match = await exactRelationshipMatch(tx, message, connection.emailAddress);
    const conditions = replyWhere(message);
    const stored = conditions.length === 0
      ? []
      : await tx.emailMessage.findMany({
          where: {
            mailboxConnectionId: connection.id,
            externalMessageId: { not: message.externalMessageId },
            providerSentAt: { lt: message.sentAt },
            OR: conditions,
          },
          select: {
            id: true,
            mailboxConnectionId: true,
            externalMessageId: true,
            internetMessageId: true,
            threadId: true,
            thread: { select: { providerThreadId: true } },
          },
        });
    const evidence: StoredMessageEvidence[] = stored.map((item) => ({
      id: item.id,
      mailboxConnectionId: item.mailboxConnectionId,
      externalMessageId: item.externalMessageId,
      providerThreadId: item.thread?.providerThreadId ?? null,
      internetMessageId: item.internetMessageId,
    }));
    const reply = detectReplyEvidence({
      mailboxConnectionId: connection.id,
      externalMessageId: message.externalMessageId,
      providerThreadId: message.providerThreadId,
      providerReplyToMessageId: message.providerReplyToMessageId,
      inReplyTo: message.inReplyTo,
      references: message.references,
    }, evidence);
    const matchedReply = reply.status === "CONFIRMED"
      ? stored.find((item) => item.id === reply.matchedMessageId)
      : null;

    let threadId = matchedReply?.threadId ?? null;
    if (message.providerThreadId) {
      const thread = await tx.emailThread.upsert({
        where: {
          mailboxConnectionId_providerThreadId: {
            mailboxConnectionId: connection.id,
            providerThreadId: message.providerThreadId,
          },
        },
        create: {
          mailboxConnectionId: connection.id,
          providerThreadId: message.providerThreadId,
          subjectKey: message.subject,
          latestMessageAt: message.sentAt,
        },
        update: {},
      });
      threadId = thread.id;
    }

    const data = {
      threadId,
      providerReplyToMessageId: message.providerReplyToMessageId,
      internetMessageId: message.internetMessageId,
      inReplyTo: message.inReplyTo,
      referencesJson: message.references,
      direction: message.direction,
      fromAddress: message.fromAddress,
      toJson: message.toAddresses,
      ccJson: message.ccAddresses,
      subject: message.subject,
      providerSentAt: message.sentAt,
      providerReceivedAt: message.receivedAt,
      folderKey: message.folderKey,
      syncState: "VERIFIED",
      rawPayloadHash: null,
      ...match,
      replyState: reply.status,
      replyBasis: reply.basis,
      replyToMessageId: reply.status === "CONFIRMED" ? reply.matchedMessageId : null,
    } satisfies Prisma.EmailMessageUncheckedUpdateInput;

    await tx.emailMessage.upsert({
      where: {
        mailboxConnectionId_externalMessageId: {
          mailboxConnectionId: connection.id,
          externalMessageId: message.externalMessageId,
        },
      },
      create: {
        mailboxConnectionId: connection.id,
        externalMessageId: message.externalMessageId,
        ...data,
      },
      update: data,
    });

    if (threadId) {
      await tx.emailThread.updateMany({
        where: {
          id: threadId,
          mailboxConnectionId: connection.id,
          OR: [{ latestMessageAt: null }, { latestMessageAt: { lt: message.sentAt } }],
        },
        data: { latestMessageAt: message.sentAt },
      });
    }
  });
}

function errorCode(error: unknown): string {
  if (error instanceof MailboxReadError) return error.code;
  return "SYNC_UNEXPECTED";
}

export async function synchronizeMailbox(input: SynchronizeMailboxInput): Promise<MailboxSyncResult> {
  const environment = input.environment ?? process.env;
  if (!getEmailFeatureFlags(environment).EMAIL_READ_SYNC_ENABLED) {
    return { status: "DISABLED", processed: 0, reason: "FEATURE_FLAG" };
  }

  const now = input.now ? new Date(input.now) : new Date();
  const config = input.config ?? getMailboxSyncConfig(environment);
  const connection = await input.prisma.mailboxConnection.findUnique({
    where: { id: input.connectionId },
    select: { id: true, provider: true, providerAccountKey: true, emailAddress: true, enabled: true },
  });
  if (!connection?.enabled) {
    return { status: "DISABLED", processed: 0, reason: "CONNECTION_DISABLED" };
  }

  let cursor = await input.prisma.emailSyncCursor.upsert({
    where: {
      mailboxConnectionId_folderKey: {
        mailboxConnectionId: connection.id,
        folderKey: input.folderKey,
      },
    },
    create: {
      mailboxConnectionId: connection.id,
      folderKey: input.folderKey,
      overlapFrom: initialLookbackFrom(now, config),
      lastAttemptAt: now,
    },
    update: { lastAttemptAt: now },
  });
  if (cursor.nextRetryAt && cursor.nextRetryAt > now) {
    return { status: "BACKOFF", processed: 0, nextRetryAt: cursor.nextRetryAt };
  }

  // The Zoho folder list uses mutable numeric offsets. Record the beginning
  // of each scan and preserve it across pages. If new mail arrives ahead of
  // our saved offset, the next completed scan must replay from this earlier
  // watermark, rather than advancing directly to the completion time.
  if (!cursor.pageToken) {
    cursor = await input.prisma.emailSyncCursor.update({
      where: { id: cursor.id },
      data: { receivedBefore: now },
    });
  }

  let processed = 0;
  let pages = 0;
  let hasMore = false;
  const verifiedThisRun: NormalizedMailboxMessage[] = [];
  let mailboxCursor: MailboxCursor = {
    receivedBefore: cursor.receivedBefore?.toISOString(),
    overlapFrom: cursor.overlapFrom?.toISOString() ?? initialLookbackFrom(now, config).toISOString(),
    pageToken: cursor.pageToken ?? undefined,
  };

  try {
    while (pages < config.maxPagesPerRun) {
      const page = await input.reader.listMessages(mailboxCursor);
      pages += 1;
      const listedOldestFirst = [...page.messages].sort(
        (a, b) => a.sentAt.getTime() - b.sentAt.getTime(),
      );
      for (const listedMessage of listedOldestFirst) {
        const metadata = await input.reader.getMessageMetadata(listedMessage.externalMessageId);
        await ingestMessage(input.prisma, connection, metadata);
        verifiedThisRun.push(metadata);
        processed += 1;
      }

      mailboxCursor = page.nextCursor ?? { ...mailboxCursor, pageToken: undefined };
      hasMore = Boolean(page.nextCursor);
      cursor = await input.prisma.emailSyncCursor.update({
        where: { id: cursor.id },
        data: {
          pageToken: page.nextCursor?.pageToken ?? null,
          lastAttemptAt: now,
          lastRunMessageCount: processed,
        },
      });
      if (!page.nextCursor) break;
    }

    // Provider lists are commonly newest-first and a thread may span pages.
    // Replaying the verified metadata oldest-first is idempotent and lets later
    // messages resolve reply evidence against originals ingested in this run.
    for (const message of [...verifiedThisRun].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())) {
      await ingestMessage(input.prisma, connection, message);
    }

    await input.prisma.emailSyncCursor.update({
      where: { id: cursor.id },
      data: {
        receivedBefore: hasMore ? cursor.receivedBefore : now,
        overlapFrom: hasMore ? cursor.overlapFrom : nextOverlapFrom(cursor.receivedBefore ?? now, config),
        pageToken: hasMore ? mailboxCursor.pageToken ?? null : null,
        lastSuccessfulAt: now,
        lastErrorCode: null,
        lastErrorAt: null,
        consecutiveFailures: 0,
        nextRetryAt: null,
        lastRunMessageCount: processed,
      },
    });
    return { status: "SUCCESS", processed, pages };
  } catch (error) {
    const failures = cursor.consecutiveFailures + 1;
    const retryAt = nextRetryAt(now, failures, config);
    const code = errorCode(error);
    await input.prisma.emailSyncCursor.update({
      where: { id: cursor.id },
      data: {
        pageToken: mailboxCursor.pageToken ?? null,
        lastErrorCode: code,
        lastErrorAt: now,
        lastAttemptAt: now,
        consecutiveFailures: failures,
        nextRetryAt: retryAt,
        lastRunMessageCount: processed,
      },
    });
    return { status: "FAILED", processed, errorCode: code, nextRetryAt: retryAt };
  }
}
