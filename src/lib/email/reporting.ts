import type { PrismaClient } from "@prisma/client";
import { getMailboxSyncConfig, type MailboxSyncConfig } from "./syncConfig";

export type MailboxHealthState = "DISABLED" | "HEALTHY" | "DEGRADED" | "STALE" | "NEVER_SYNCED";

export async function getMailboxSyncHealthReport(
  prisma: PrismaClient,
  now = new Date(),
  config: MailboxSyncConfig = getMailboxSyncConfig(),
) {
  const [connections, matchCounts, unmatchedMessages] = await Promise.all([
    prisma.mailboxConnection.findMany({
      include: {
        cursors: { orderBy: { folderKey: "asc" } },
        _count: { select: { messages: true } },
      },
      orderBy: { emailAddress: "asc" },
    }),
    prisma.emailMessage.groupBy({
      by: ["mailboxConnectionId", "matchState"],
      _count: { _all: true },
    }),
    prisma.emailMessage.findMany({
      where: { matchState: { in: ["UNMATCHED", "AMBIGUOUS"] } },
      select: {
        id: true,
        mailboxConnectionId: true,
        externalMessageId: true,
        direction: true,
        fromAddress: true,
        subject: true,
        providerSentAt: true,
        matchState: true,
      },
      orderBy: { providerSentAt: "desc" },
      take: 50,
    }),
  ]);

  const staleBefore = new Date(now.getTime() - config.intervalMinutes * 2 * 60 * 1_000);
  const connectionReports = connections.map((connection) => {
    const latestSuccess = connection.cursors
      .map((cursor) => cursor.lastSuccessfulAt)
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const latestError = connection.cursors
      .map((cursor) => cursor.lastErrorAt)
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    let health: MailboxHealthState;
    if (!connection.enabled) health = "DISABLED";
    else if (latestError && (!latestSuccess || latestError > latestSuccess)) health = "DEGRADED";
    else if (!latestSuccess) health = "NEVER_SYNCED";
    else if (latestSuccess < staleBefore) health = "STALE";
    else health = "HEALTHY";

    const counts = Object.fromEntries(
      matchCounts
        .filter((item) => item.mailboxConnectionId === connection.id)
        .map((item) => [item.matchState, item._count._all]),
    );
    return {
      id: connection.id,
      provider: connection.provider,
      emailAddress: connection.emailAddress,
      enabled: connection.enabled,
      health,
      totalMessages: connection._count.messages,
      exactMatches: counts.EXACT ?? 0,
      unmatched: counts.UNMATCHED ?? 0,
      ambiguous: counts.AMBIGUOUS ?? 0,
      cursors: connection.cursors.map((cursor) => ({
        folderKey: cursor.folderKey,
        lastAttemptAt: cursor.lastAttemptAt,
        lastSuccessfulAt: cursor.lastSuccessfulAt,
        lastErrorCode: cursor.lastErrorCode,
        lastErrorAt: cursor.lastErrorAt,
        consecutiveFailures: cursor.consecutiveFailures,
        nextRetryAt: cursor.nextRetryAt,
        lastRunMessageCount: cursor.lastRunMessageCount,
      })),
    };
  });

  return {
    generatedAt: now,
    intervalMinutes: config.intervalMinutes,
    connections: connectionReports,
    summary: {
      connections: connectionReports.length,
      enabledConnections: connectionReports.filter((item) => item.enabled).length,
      degradedConnections: connectionReports.filter((item) => ["DEGRADED", "STALE"].includes(item.health)).length,
      unmatchedMessages: matchCounts
        .filter((item) => ["UNMATCHED", "AMBIGUOUS"].includes(item.matchState))
        .reduce((total, item) => total + item._count._all, 0),
    },
    unmatchedMessages,
  };
}
