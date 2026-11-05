import { normalizeEmailAddress } from "./normalization";

export type ContactEmailCandidate = {
  id: string;
  accountId: string;
  email: string | null;
};

export type ExactContactMatch =
  | {
      status: "MATCHED";
      basis: "EXACT_CONTACT_EMAIL";
      contactId: string;
      accountId: string;
    }
  | {
      status: "UNMATCHED";
      basis: null;
    }
  | {
      status: "AMBIGUOUS";
      basis: null;
      candidateContactIds: string[];
    };

/**
 * Trim-and-lowercase equality is the sole automatic Contact matching rule.
 * Names, domains, Accounts and fuzzy similarity are deliberately ignored.
 */
export function matchContactByExactEmail(
  address: string,
  contacts: readonly ContactEmailCandidate[],
): ExactContactMatch {
  const normalizedAddress = normalizeEmailAddress(address);
  if (!normalizedAddress) return { status: "UNMATCHED", basis: null };

  const matches = contacts.filter((contact) => {
    if (!contact.email) return false;
    return normalizeEmailAddress(contact.email) === normalizedAddress;
  });

  if (matches.length === 0) return { status: "UNMATCHED", basis: null };
  if (matches.length > 1) {
    return {
      status: "AMBIGUOUS",
      basis: null,
      candidateContactIds: matches.map((contact) => contact.id).sort(),
    };
  }

  return {
    status: "MATCHED",
    basis: "EXACT_CONTACT_EMAIL",
    contactId: matches[0].id,
    accountId: matches[0].accountId,
  };
}
