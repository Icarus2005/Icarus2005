export const MAILBOX_PROVIDERS = ["ZOHO", "MICROSOFT", "GOOGLE", "OTHER"] as const;

export type MailboxProvider = (typeof MAILBOX_PROVIDERS)[number];
export type MailboxMessageDirection = "INBOUND" | "OUTBOUND";

export type MailboxCursor = {
  receivedBefore?: string;
  overlapFrom?: string;
  pageToken?: string;
};

/**
 * The only message shape allowed past a provider adapter in Sprint 4A.
 * Bodies, snippets, attachments, raw headers and raw provider payloads are
 * intentionally absent so downstream code cannot accidentally persist them.
 */
export type NormalizedMailboxMessage = {
  provider: MailboxProvider;
  providerAccountKey: string;
  externalMessageId: string;
  providerThreadId: string | null;
  providerReplyToMessageId: string | null;
  internetMessageId: string | null;
  inReplyTo: string | null;
  references: string[];
  direction: MailboxMessageDirection;
  fromAddress: string;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string | null;
  sentAt: Date;
  receivedAt: Date | null;
  folderKey: string | null;
};

export type MailboxMessagePage = {
  messages: NormalizedMailboxMessage[];
  nextCursor: MailboxCursor | null;
};

/**
 * Read-only, provider-neutral mailbox boundary. Provider-specific response
 * types, OAuth behavior and regional endpoints belong in future adapters.
 */
export interface MailboxReader {
  listMessages(cursor: MailboxCursor): Promise<MailboxMessagePage>;
  getMessageMetadata(externalMessageId: string): Promise<NormalizedMailboxMessage>;
}

export class MailboxReadError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = true,
  ) {
    super(message);
    this.name = "MailboxReadError";
  }
}

export type MailboxMessageMetadataInput = {
  provider: MailboxProvider;
  providerAccountKey: string;
  externalMessageId: string;
  providerThreadId?: string | null;
  providerReplyToMessageId?: string | null;
  internetMessageId?: string | null;
  inReplyTo?: string | null;
  references?: readonly string[] | null;
  direction: MailboxMessageDirection;
  fromAddress: string;
  toAddresses?: readonly string[] | null;
  ccAddresses?: readonly string[] | null;
  subject?: string | null;
  sentAt: Date | string;
  receivedAt?: Date | string | null;
  folderKey?: string | null;
};
