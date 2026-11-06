import type {
  MailboxCursor,
  MailboxMessageDirection,
  MailboxMessageMetadataInput,
  MailboxMessagePage,
  MailboxReader,
} from "./mailbox";
import { MailboxReadError } from "./mailbox";
import { normalizeMailboxMessage } from "./normalization";

type FetchLike = typeof fetch;

export type ZohoMailboxReaderConfig = {
  accountId: string;
  providerAccountKey: string;
  mailboxAddress: string;
  folderId: string;
  folderKey: string;
  direction: MailboxMessageDirection;
  dataRegion: string;
  pageSize: number;
  accessToken: () => Promise<string>;
};

type ZohoMessageListItem = Record<string, unknown>;

const ZOHO_MAIL_HOSTS: Record<string, string> = {
  com: "mail.zoho.com",
  eu: "mail.zoho.eu",
  in: "mail.zoho.in",
  "com.au": "mail.zoho.com.au",
  jp: "mail.zoho.jp",
  ca: "mail.zohocloud.ca",
  "com.cn": "mail.zoho.com.cn",
  ae: "mail.zoho.ae",
  sa: "mail.zoho.sa",
};

function required(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new MailboxReadError("ZOHO_CONFIGURATION", `${name} is required`, false);
  return trimmed;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function decodeAddressText(value: unknown): string {
  return (asString(value) ?? "")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

export function extractZohoAddresses(value: unknown): string[] {
  const matches = decodeAddressText(value).match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  return [...new Set(matches.map((address) => address.toLowerCase()))];
}

function timestamp(value: unknown, field: string): Date {
  const stringValue = asString(value);
  const milliseconds = stringValue && /^\d+$/.test(stringValue) ? Number(stringValue) : NaN;
  const date = Number.isFinite(milliseconds) ? new Date(milliseconds) : new Date(stringValue ?? "");
  if (Number.isNaN(date.getTime())) {
    throw new MailboxReadError("ZOHO_INVALID_METADATA", `${field} is invalid`, false);
  }
  return date;
}

function firstHeader(headers: Record<string, unknown>, names: string[]): string | null {
  const entry = Object.entries(headers).find(([key]) => names.some((name) => key.toLowerCase() === name));
  if (!entry) return null;
  const value = entry[1];
  if (Array.isArray(value)) return asString(value[0]);
  return asString(value);
}

function headerMessageIds(value: string | null): string[] {
  if (!value) return [];
  const bracketed = [...value.matchAll(/<([^<>]+)>/g)].map((match) => match[1]);
  return bracketed.length > 0 ? bracketed : value.split(/\s+/).filter(Boolean);
}

export class ZohoMailboxReader implements MailboxReader {
  private readonly baseUrl: string;
  private readonly messageIndex = new Map<string, ZohoMessageListItem>();

  constructor(
    private readonly config: ZohoMailboxReaderConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    const region = required(config.dataRegion, "dataRegion").toLowerCase();
    const host = ZOHO_MAIL_HOSTS[region];
    if (!host) throw new MailboxReadError("ZOHO_DATA_REGION", "Unsupported Zoho data region", false);
    if (!Number.isInteger(config.pageSize) || config.pageSize < 1 || config.pageSize > 200) {
      throw new MailboxReadError("ZOHO_PAGE_SIZE", "Zoho page size must be between 1 and 200", false);
    }
    this.baseUrl = `https://${host}/api/accounts/${encodeURIComponent(required(config.accountId, "accountId"))}`;
  }

  private async getJson(url: string): Promise<Record<string, unknown>> {
    const token = await this.config.accessToken();
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Zoho-oauthtoken ${token}`,
        },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new MailboxReadError("ZOHO_UNAVAILABLE", "Zoho Mail is unavailable");
    }
    if (!response.ok) {
      const code = response.status === 429
        ? "ZOHO_RATE_LIMIT"
        : response.status >= 500
          ? "ZOHO_UNAVAILABLE"
          : `ZOHO_HTTP_${response.status}`;
      throw new MailboxReadError(code, `Zoho Mail metadata request failed (${response.status})`, response.status === 429 || response.status >= 500);
    }
    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      throw new MailboxReadError("ZOHO_INVALID_RESPONSE", "Zoho Mail returned invalid JSON");
    }
    return payload as Record<string, unknown>;
  }

  private summaryInput(item: ZohoMessageListItem): MailboxMessageMetadataInput {
    const externalMessageId = required(asString(item.messageId) ?? "", "messageId");
    const sentAt = timestamp(item.sentDateInGMT ?? item.receivedTime, "sentDateInGMT");
    const receivedAt = item.receivedTime == null ? null : timestamp(item.receivedTime, "receivedTime");
    return {
      provider: "ZOHO",
      providerAccountKey: required(this.config.providerAccountKey, "providerAccountKey"),
      externalMessageId,
      providerThreadId: asString(item.threadId),
      providerReplyToMessageId: null,
      internetMessageId: null,
      inReplyTo: null,
      references: [],
      direction: this.config.direction,
      fromAddress: required(asString(item.fromAddress) ?? "", "fromAddress"),
      toAddresses: extractZohoAddresses(item.toAddress),
      ccAddresses: extractZohoAddresses(item.ccAddress),
      subject: asString(item.subject),
      sentAt,
      receivedAt,
      folderKey: this.config.folderKey,
    };
  }

  async listMessages(cursor: MailboxCursor): Promise<MailboxMessagePage> {
    const start = cursor.pageToken && /^\d+$/.test(cursor.pageToken) ? Number(cursor.pageToken) : 1;
    const url = new URL(`${this.baseUrl}/messages/view`);
    url.searchParams.set("folderId", required(this.config.folderId, "folderId"));
    url.searchParams.set("start", String(start));
    url.searchParams.set("limit", String(this.config.pageSize));
    url.searchParams.set("status", "all");
    url.searchParams.set("includeto", "true");
    url.searchParams.set("sortBy", "date");
    url.searchParams.set("sortorder", "false");

    const payload = await this.getJson(url.toString());
    const rawItems = Array.isArray(payload.data) ? payload.data.map(asRecord) : [];
    const cutoff = cursor.overlapFrom ? new Date(cursor.overlapFrom) : null;
    const messages = [];
    let reachedCutoff = false;
    for (const item of rawItems) {
      const input = this.summaryInput(item);
      if (cutoff && input.sentAt < cutoff) {
        reachedCutoff = true;
        continue;
      }
      this.messageIndex.set(input.externalMessageId, item);
      messages.push(normalizeMailboxMessage(input));
    }

    const nextCursor = !reachedCutoff && rawItems.length === this.config.pageSize
      ? { ...cursor, pageToken: String(start + this.config.pageSize) }
      : null;
    return { messages, nextCursor };
  }

  async getMessageMetadata(externalMessageId: string) {
    const indexed = this.messageIndex.get(externalMessageId);
    if (!indexed) {
      throw new MailboxReadError("ZOHO_MESSAGE_NOT_LISTED", "Message metadata must follow a verified list result", false);
    }
    const folderId = asString(indexed.folderId) ?? required(this.config.folderId, "folderId");
    const encodedFolder = encodeURIComponent(folderId);
    const encodedMessage = encodeURIComponent(externalMessageId);
    const [detailsPayload, headersPayload] = await Promise.all([
      this.getJson(`${this.baseUrl}/folders/${encodedFolder}/messages/${encodedMessage}/details`),
      this.getJson(`${this.baseUrl}/folders/${encodedFolder}/messages/${encodedMessage}/header?raw=false`),
    ]);
    const details = asRecord(detailsPayload.data);
    const headerData = asRecord(headersPayload.data);
    const headers = asRecord(headerData.headerContent);
    const inReplyTo = firstHeader(headers, ["in-reply-to"]);
    const references = firstHeader(headers, ["references"]);

    return normalizeMailboxMessage({
      ...this.summaryInput({ ...indexed, ...details }),
      internetMessageId: firstHeader(headers, ["message-id"]),
      inReplyTo,
      references: headerMessageIds(references),
    });
  }
}
