import type { MailboxMessageDirection } from "./mailbox";
import { MailboxReadError } from "./mailbox";
import { ZohoMailboxReader } from "./zohoReader";
import type { MailboxSyncConfig } from "./syncConfig";

type Environment = Readonly<Record<string, string | undefined>>;

const ZOHO_ACCOUNTS_HOSTS: Record<string, string> = {
  com: "accounts.zoho.com",
  eu: "accounts.zoho.eu",
  in: "accounts.zoho.in",
  "com.au": "accounts.zoho.com.au",
  jp: "accounts.zoho.jp",
  ca: "accounts.zohocloud.ca",
  "com.cn": "accounts.zoho.com.cn",
  ae: "accounts.zoho.ae",
  sa: "accounts.zoho.sa",
};

function value(environment: Environment, name: string): string {
  const result = environment[name]?.trim();
  if (!result) throw new MailboxReadError("ZOHO_READ_CONFIGURATION", `${name} is not configured`, false);
  return result;
}

async function refreshReadAccessToken(environment: Environment, fetchImpl: typeof fetch) {
  const region = (environment.ZOHO_READ_DATA_REGION?.trim() || "com").toLowerCase();
  const host = ZOHO_ACCOUNTS_HOSTS[region];
  if (!host) throw new MailboxReadError("ZOHO_DATA_REGION", "Unsupported Zoho read data region", false);
  const params = new URLSearchParams({
    refresh_token: value(environment, "ZOHO_READ_REFRESH_TOKEN"),
    client_id: value(environment, "ZOHO_READ_CLIENT_ID"),
    client_secret: value(environment, "ZOHO_READ_CLIENT_SECRET"),
    grant_type: "refresh_token",
  });
  let response: Response;
  try {
    response = await fetchImpl(`https://${host}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new MailboxReadError("ZOHO_AUTH_UNAVAILABLE", "Zoho read-token refresh is unavailable");
  }
  if (!response.ok) {
    throw new MailboxReadError("ZOHO_AUTH_FAILED", `Zoho read-token refresh failed (${response.status})`, response.status >= 500);
  }
  const payload = await response.json().catch(() => null);
  const token = payload && typeof payload === "object" && "access_token" in payload
    ? (payload as { access_token?: unknown }).access_token
    : null;
  if (typeof token !== "string" || !token) {
    throw new MailboxReadError("ZOHO_AUTH_INVALID", "Zoho read-token refresh returned no access token");
  }
  const expiresIn = payload && typeof payload === "object" && "expires_in" in payload
    ? Number((payload as { expires_in?: unknown }).expires_in)
    : 3_600;
  return { token, expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3_600 };
}

export function createZohoReadAdapter(
  connection: { providerAccountKey: string; emailAddress: string; dataRegion: string | null },
  folder: { key: "inbox" | "sent"; direction: MailboxMessageDirection },
  config: MailboxSyncConfig,
  environment: Environment = process.env,
  fetchImpl: typeof fetch = fetch,
) {
  const accountId = value(environment, "ZOHO_READ_ACCOUNT_ID");
  const mailboxAddress = value(environment, "ZOHO_READ_MAILBOX_ADDRESS");
  if (accountId !== connection.providerAccountKey || mailboxAddress.toLowerCase() !== connection.emailAddress.toLowerCase()) {
    throw new MailboxReadError("ZOHO_CONNECTION_MISMATCH", "Read credentials do not match the mailbox connection", false);
  }
  const credentialRegion = (environment.ZOHO_READ_DATA_REGION?.trim() || "com").toLowerCase();
  if (connection.dataRegion && connection.dataRegion.toLowerCase() !== credentialRegion) {
    throw new MailboxReadError("ZOHO_CONNECTION_REGION_MISMATCH", "Read credentials do not match the mailbox data region", false);
  }
  let cachedToken: { token: string; expiresAt: number } | null = null;
  const accessToken = async () => {
    if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
    const refreshed = await refreshReadAccessToken(environment, fetchImpl);
    cachedToken = {
      token: refreshed.token,
      expiresAt: Date.now() + Math.max(60, refreshed.expiresIn - 60) * 1_000,
    };
    return refreshed.token;
  };
  return new ZohoMailboxReader({
    accountId,
    providerAccountKey: connection.providerAccountKey,
    mailboxAddress,
    folderId: value(environment, folder.key === "inbox" ? "ZOHO_READ_INBOX_FOLDER_ID" : "ZOHO_READ_SENT_FOLDER_ID"),
    folderKey: folder.key,
    direction: folder.direction,
    dataRegion: connection.dataRegion ?? environment.ZOHO_READ_DATA_REGION ?? "com",
    pageSize: config.pageSize,
    accessToken,
  }, fetchImpl);
}
