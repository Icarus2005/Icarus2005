import { normalizeInternetMessageId } from "./normalization";

export type StoredMessageEvidence = {
  id: string;
  mailboxConnectionId: string;
  externalMessageId: string;
  providerThreadId: string | null;
  internetMessageId: string | null;
};

export type ReplyCandidateEvidence = {
  mailboxConnectionId: string;
  externalMessageId: string;
  providerThreadId: string | null;
  providerReplyToMessageId: string | null;
  inReplyTo: string | null;
  references: readonly string[];
  hasAddressSubjectTimeSimilarity?: boolean;
};

export type ReplyEvidenceResult =
  | {
      status: "CONFIRMED";
      basis: "PROVIDER_THREAD" | "IN_REPLY_TO" | "REFERENCES" | "PROVIDER_REPLY_RELATION";
      matchedMessageId: string;
    }
  | {
      status: "REVIEW_REQUIRED";
      basis: "ADDRESS_SUBJECT_TIME_SIMILARITY";
      matchedMessageId: null;
    }
  | {
      status: "NOT_A_REPLY";
      basis: null;
      matchedMessageId: null;
    };

/** Applies reply evidence in strict descending order and within one mailbox. */
export function detectReplyEvidence(
  candidate: ReplyCandidateEvidence,
  storedMessages: readonly StoredMessageEvidence[],
): ReplyEvidenceResult {
  const eligible = storedMessages.filter(
    (message) =>
      message.mailboxConnectionId === candidate.mailboxConnectionId &&
      message.externalMessageId !== candidate.externalMessageId,
  );

  if (candidate.providerThreadId) {
    const match = eligible.find((message) => message.providerThreadId === candidate.providerThreadId);
    if (match) return { status: "CONFIRMED", basis: "PROVIDER_THREAD", matchedMessageId: match.id };
  }

  const byInternetMessageId = new Map<string, StoredMessageEvidence>();
  for (const message of eligible) {
    const normalized = normalizeInternetMessageId(message.internetMessageId);
    if (normalized) byInternetMessageId.set(normalized, message);
  }

  const inReplyTo = normalizeInternetMessageId(candidate.inReplyTo);
  if (inReplyTo) {
    const match = byInternetMessageId.get(inReplyTo);
    if (match) return { status: "CONFIRMED", basis: "IN_REPLY_TO", matchedMessageId: match.id };
  }

  for (const reference of [...candidate.references].reverse()) {
    const normalized = normalizeInternetMessageId(reference);
    const match = normalized ? byInternetMessageId.get(normalized) : undefined;
    if (match) return { status: "CONFIRMED", basis: "REFERENCES", matchedMessageId: match.id };
  }

  if (candidate.providerReplyToMessageId) {
    const match = eligible.find(
      (message) => message.externalMessageId === candidate.providerReplyToMessageId,
    );
    if (match) {
      return {
        status: "CONFIRMED",
        basis: "PROVIDER_REPLY_RELATION",
        matchedMessageId: match.id,
      };
    }
  }

  if (candidate.hasAddressSubjectTimeSimilarity) {
    return {
      status: "REVIEW_REQUIRED",
      basis: "ADDRESS_SUBJECT_TIME_SIMILARITY",
      matchedMessageId: null,
    };
  }

  return { status: "NOT_A_REPLY", basis: null, matchedMessageId: null };
}
