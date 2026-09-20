/**
 * Email provider abstraction (Sprint 06D, Phase 2).
 *
 * The rest of the app only ever talks to this interface — nothing outside
 * src/lib/email/ knows Zoho exists. Swapping or adding a provider later
 * means implementing EmailProvider again, not touching the send route, the
 * UI, or the Activity recording logic.
 */
export type SendEmailInput = {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  /** Reserved for future reply-threading; unused in Sprint 06D (no inbound mail yet). */
  replyToMessageId?: string;
  metadata?: Record<string, string>;
};

export type SendEmailResult = {
  /** The provider's own message identifier, when it returns one. Audit-only. */
  providerMessageId: string | null;
};

export class EmailSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailSendError";
  }
}

export interface EmailProvider {
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
}
