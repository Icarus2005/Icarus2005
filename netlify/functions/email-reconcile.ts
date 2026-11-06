import { PrismaClient } from "@prisma/client";
import { getEmailFeatureFlags } from "../../src/lib/email/featureFlags";
import { synchronizeMailbox } from "../../src/lib/email/synchronization";
import { getMailboxSyncConfig } from "../../src/lib/email/syncConfig";
import { createZohoReadAdapter } from "../../src/lib/email/zohoReadCredentials";

export const config = { schedule: "*/30 * * * *" };

export default async function handler() {
  if (!getEmailFeatureFlags().EMAIL_READ_SYNC_ENABLED) {
    return new Response(JSON.stringify({ status: "disabled" }), { status: 200 });
  }

  const prisma = new PrismaClient();
  const syncConfig = getMailboxSyncConfig();
  try {
    const connections = await prisma.mailboxConnection.findMany({
      where: { enabled: true },
      select: { id: true, provider: true, providerAccountKey: true, emailAddress: true, dataRegion: true },
    });
    const results = [];
    for (const connection of connections) {
      if (connection.provider !== "ZOHO") {
        results.push({ connectionId: connection.id, status: "unsupported-provider" });
        continue;
      }
      for (const folder of [
        { key: "inbox", direction: "INBOUND" },
        { key: "sent", direction: "OUTBOUND" },
      ] as const) {
        let reader;
        try {
          reader = createZohoReadAdapter(connection, folder, syncConfig);
        } catch (configurationError) {
          // Defer configuration failures into the provider-neutral service so
          // bounded health/error state is persisted on the folder cursor.
          reader = {
            listMessages: async () => { throw configurationError; },
            getMessageMetadata: async () => { throw configurationError; },
          };
        }
        const result = await synchronizeMailbox({
          prisma,
          connectionId: connection.id,
          folderKey: folder.key,
          reader,
          config: syncConfig,
        });
        results.push({ connectionId: connection.id, folder: folder.key, ...result });
      }
    }
    return new Response(JSON.stringify({ status: "complete", results }), { status: 200 });
  } finally {
    await prisma.$disconnect();
  }
}
