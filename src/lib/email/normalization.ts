import {
  MAILBOX_PROVIDERS,
  type MailboxMessageMetadataInput,
  type NormalizedMailboxMessage,
} from "./mailbox";

const EMAIL_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class MailboxNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailboxNormalizationError";
  }
}

export function normalizeEmailAddress(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return EMAIL_ADDRESS.test(normalized) ? normalized : null;
}

export function normalizeInternetMessageId(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withoutBrackets = trimmed.startsWith("<") && trimmed.endsWith(">")
    ? trimmed.slice(1, -1).trim()
    : trimmed;
  return withoutBrackets ? `<${withoutBrackets.toLowerCase()}>` : null;
}

function requiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new MailboxNormalizationError(`${field} is required`);
  return normalized;
}

function optionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function validDate(value: Date | string, field: string): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new MailboxNormalizationError(`${field} must be a valid date`);
  }
  return date;
}

function normalizeAddressList(values: readonly string[] | null | undefined, field: string): string[] {
  const addresses = new Set<string>();
  for (const value of values ?? []) {
    const normalized = normalizeEmailAddress(value);
    if (!normalized) throw new MailboxNormalizationError(`${field} contains an invalid email address`);
    addresses.add(normalized);
  }
  return [...addresses];
}

/**
 * Pick-list normalization is intentional: even if a provider adapter passes
 * extra properties at runtime, message content cannot cross this boundary.
 */
export function normalizeMailboxMessage(input: MailboxMessageMetadataInput): NormalizedMailboxMessage {
  if (!MAILBOX_PROVIDERS.includes(input.provider)) {
    throw new MailboxNormalizationError("provider is not supported");
  }

  const fromAddress = normalizeEmailAddress(input.fromAddress);
  if (!fromAddress) throw new MailboxNormalizationError("fromAddress must be a valid email address");

  const references = new Set<string>();
  for (const reference of input.references ?? []) {
    const normalized = normalizeInternetMessageId(reference);
    if (normalized) references.add(normalized);
  }

  return {
    provider: input.provider,
    providerAccountKey: requiredText(input.providerAccountKey, "providerAccountKey"),
    externalMessageId: requiredText(input.externalMessageId, "externalMessageId"),
    providerThreadId: optionalText(input.providerThreadId),
    providerReplyToMessageId: optionalText(input.providerReplyToMessageId),
    internetMessageId: normalizeInternetMessageId(input.internetMessageId),
    inReplyTo: normalizeInternetMessageId(input.inReplyTo),
    references: [...references],
    direction: input.direction,
    fromAddress,
    toAddresses: normalizeAddressList(input.toAddresses, "toAddresses"),
    ccAddresses: normalizeAddressList(input.ccAddresses, "ccAddresses"),
    subject: optionalText(input.subject),
    sentAt: validDate(input.sentAt, "sentAt"),
    receivedAt: input.receivedAt == null ? null : validDate(input.receivedAt, "receivedAt"),
    folderKey: optionalText(input.folderKey),
  };
}

export function mailboxMessageIdentity(message: Pick<NormalizedMailboxMessage, "provider" | "providerAccountKey" | "externalMessageId">): string {
  return `${message.provider}\u0000${message.providerAccountKey}\u0000${message.externalMessageId}`;
}

/** Keeps the last provider-verified representation for a replayed message. */
export function deduplicateMailboxMessages(messages: readonly NormalizedMailboxMessage[]): NormalizedMailboxMessage[] {
  const byIdentity = new Map<string, NormalizedMailboxMessage>();
  for (const message of messages) byIdentity.set(mailboxMessageIdentity(message), message);
  return [...byIdentity.values()];
}
