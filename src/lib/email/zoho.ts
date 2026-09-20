/**
 * Zoho Mail provider (Sprint 06D, Phase 1/2).
 *
 * Server-to-server sending from one configured ArqOne mailbox via the Zoho
 * Mail REST API: POST https://mail.zoho.<dc>/api/accounts/{accountId}/messages
 * with `Authorization: Zoho-oauthtoken <access_token>`, where the access
 * token is minted per-send from a long-lived refresh token via
 * https://accounts.zoho.<dc>/oauth/v2/token (grant_type=refresh_token).
 * `<dc>` is the data-center suffix (com/eu/in/com.au/jp) — configurable
 * because it depends on which Zoho region the mailbox was created in.
 *
 * All five ZOHO_* values below are required together; Piero must obtain
 * them once via Zoho's API Console (https://api-console.zoho.<dc>) and the
 * account's own OAuth self-client flow — this module cannot provision them.
 * See the Sprint 06D report for the exact one-time setup steps.
 *
 * Never logs the client secret, refresh token, or access token.
 */
import { EmailProvider, SendEmailInput, SendEmailResult, EmailSendError } from "./provider";

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

function zohoDataCenter(): string {
  return env("ZOHO_DATA_CENTER") ?? "com";
}

export function isZohoConfigured(): boolean {
  return Boolean(
    env("ZOHO_CLIENT_ID") && env("ZOHO_CLIENT_SECRET") && env("ZOHO_REFRESH_TOKEN") && env("ZOHO_ACCOUNT_ID") && env("ZOHO_FROM_ADDRESS")
  );
}

export function zohoFromAddress(): string | null {
  return env("ZOHO_FROM_ADDRESS") ?? null;
}

async function getAccessToken(): Promise<string> {
  const clientId = env("ZOHO_CLIENT_ID");
  const clientSecret = env("ZOHO_CLIENT_SECRET");
  const refreshToken = env("ZOHO_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new EmailSendError("Zoho is not configured.");
  }

  const url = `https://accounts.zoho.${zohoDataCenter()}/oauth/v2/token`;
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });

  let res: Response;
  try {
    res = await fetch(`${url}?${params.toString()}`, { method: "POST", signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new EmailSendError("Could not reach Zoho to refresh the access token.");
  }
  if (!res.ok) {
    // Deliberately don't include the response body — it can echo request params.
    throw new EmailSendError(`Zoho token refresh failed (${res.status}).`);
  }
  const data = await res.json().catch(() => null);
  const accessToken = data?.access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new EmailSendError("Zoho token refresh returned no access token.");
  }
  return accessToken;
}

/** Extracts a message id from Zoho's response shape defensively — the exact
 * shape isn't contract-critical here since it's audit-only metadata. */
function extractMessageId(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const payload = (d.data && typeof d.data === "object" ? (d.data as Record<string, unknown>) : d);
  const candidate = payload.messageId ?? payload.messageID ?? payload.id;
  return typeof candidate === "string" ? candidate : null;
}

class ZohoEmailProvider implements EmailProvider {
  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const accountId = env("ZOHO_ACCOUNT_ID");
    const fromAddress = env("ZOHO_FROM_ADDRESS");
    if (!accountId || !fromAddress) {
      throw new EmailSendError("Zoho is not configured.");
    }

    const accessToken = await getAccessToken();
    const url = `https://mail.zoho.${zohoDataCenter()}/api/accounts/${accountId}/messages`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fromAddress,
          toAddress: input.to,
          ccAddress: input.cc ?? "",
          subject: input.subject,
          content: input.body,
          askReceipt: "no",
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new EmailSendError("Could not reach Zoho Mail to send the email.");
    }

    if (!res.ok) {
      throw new EmailSendError(`Zoho Mail send failed (${res.status}).`);
    }

    const data = await res.json().catch(() => null);
    return { providerMessageId: extractMessageId(data) };
  }
}

/** Returns null when Zoho isn't configured — callers must handle that as
 * "sending unavailable", never fall back to a simulated send. */
export function getEmailProvider(): EmailProvider | null {
  if (!isZohoConfigured()) return null;
  return new ZohoEmailProvider();
}
