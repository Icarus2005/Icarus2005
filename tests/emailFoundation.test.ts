import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import { matchContactByExactEmail } from "../src/lib/email/contactMatching";
import { getEmailFeatureFlags } from "../src/lib/email/featureFlags";
import type { MailboxMessageMetadataInput } from "../src/lib/email/mailbox";
import {
  deduplicateMailboxMessages,
  normalizeMailboxMessage,
} from "../src/lib/email/normalization";
import { detectReplyEvidence } from "../src/lib/email/replyEvidence";

function metadata(overrides: Partial<MailboxMessageMetadataInput> = {}): MailboxMessageMetadataInput {
  return {
    provider: "ZOHO",
    providerAccountKey: "account-1",
    externalMessageId: "message-1",
    providerThreadId: "thread-1",
    providerReplyToMessageId: null,
    internetMessageId: "<MESSAGE-1@EXAMPLE.COM>",
    inReplyTo: null,
    references: [],
    direction: "INBOUND",
    fromAddress: " Person@Example.com ",
    toAddresses: ["MAILBOX@example.com"],
    ccAddresses: [],
    subject: "Hello",
    sentAt: "2026-11-05T08:00:00.000Z",
    receivedAt: "2026-11-05T08:00:01.000Z",
    folderKey: "inbox",
    ...overrides,
  };
}

describe("Sprint 4A email normalization and privacy", () => {
  test("normalizes provider metadata without retaining bodies, snippets, attachments or raw data", () => {
    const providerPayload = {
      ...metadata(),
      body: "private body marker",
      bodyHtml: "<p>private html marker</p>",
      snippet: "private snippet marker",
      attachments: [{ name: "private.pdf" }],
      rawHeaders: { authorization: "secret" },
      rawPayload: "provider payload marker",
    };

    const normalized = normalizeMailboxMessage(providerPayload);
    const serialized = JSON.stringify(normalized);

    assert.equal(normalized.fromAddress, "person@example.com");
    assert.deepEqual(normalized.toAddresses, ["mailbox@example.com"]);
    assert.equal(normalized.internetMessageId, "MESSAGE-1@EXAMPLE.COM");
    for (const forbidden of [
      "body",
      "bodyHtml",
      "snippet",
      "attachments",
      "rawHeaders",
      "rawPayload",
      "private body marker",
      "private snippet marker",
      "private.pdf",
    ]) {
      assert.equal(serialized.includes(forbidden), false, `normalized metadata leaked ${forbidden}`);
    }
  });

  test("deduplicates webhook/poll replays by provider, mailbox and external message id", () => {
    const first = normalizeMailboxMessage(metadata({ subject: "First verified view" }));
    const replay = normalizeMailboxMessage(metadata({ subject: "Latest verified view" }));
    const otherMailbox = normalizeMailboxMessage(
      metadata({ providerAccountKey: "account-2", subject: "Different mailbox" }),
    );

    const result = deduplicateMailboxMessages([first, replay, otherMailbox]);
    assert.equal(result.length, 2);
    assert.equal(result[0].subject, "Latest verified view");
    assert.equal(result[1].subject, "Different mailbox");
  });

  test("normalizes RFC Message-ID syntax without changing semantic case", () => {
    const bracketed = normalizeMailboxMessage(
      metadata({ internetMessageId: "  <CaseSensitive.Left@Example.COM>  " }),
    );
    const alreadySemantic = normalizeMailboxMessage(
      metadata({ internetMessageId: "CaseSensitive.Left@Example.COM" }),
    );
    const malformed = normalizeMailboxMessage(metadata({ internetMessageId: "<missing-at>" }));

    assert.equal(bracketed.internetMessageId, "CaseSensitive.Left@Example.COM");
    assert.equal(alreadySemantic.internetMessageId, "CaseSensitive.Left@Example.COM");
    assert.equal(malformed.internetMessageId, null);
  });
});

describe("Sprint 4A exact Contact matching", () => {
  const contacts = [
    { id: "contact-1", accountId: "account-1", email: "person@example.com" },
    { id: "contact-2", accountId: "account-2", email: "other@example.com" },
  ];

  test("matches only trim-and-lowercase exact email equality and derives the Account", () => {
    assert.deepEqual(matchContactByExactEmail(" PERSON@EXAMPLE.COM ", contacts), {
      status: "MATCHED",
      basis: "EXACT_CONTACT_EMAIL",
      contactId: "contact-1",
      accountId: "account-1",
    });
  });

  test("does not infer a Contact from a matching domain or malformed display-name address", () => {
    assert.equal(matchContactByExactEmail("unknown@example.com", contacts).status, "UNMATCHED");
    assert.equal(matchContactByExactEmail("Person <person@example.com>", contacts).status, "UNMATCHED");
  });

  test("returns ambiguous without selecting a Contact when normalized duplicates exist", () => {
    const result = matchContactByExactEmail("person@example.com", [
      ...contacts,
      { id: "contact-3", accountId: "account-3", email: "PERSON@example.com" },
    ]);
    assert.deepEqual(result, {
      status: "AMBIGUOUS",
      basis: null,
      candidateContactIds: ["contact-1", "contact-3"],
    });
  });
});

describe("Sprint 4A reply evidence", () => {
  const stored = [
    {
      id: "stored-thread",
      mailboxConnectionId: "mailbox-1",
      externalMessageId: "external-thread",
      providerThreadId: "thread-1",
      internetMessageId: "<thread@example.com>",
    },
    {
      id: "stored-header",
      mailboxConnectionId: "mailbox-1",
      externalMessageId: "external-header",
      providerThreadId: "thread-2",
      internetMessageId: "<header@example.com>",
    },
  ];

  test("applies provider-thread evidence before RFC header evidence", () => {
    const result = detectReplyEvidence(
      {
        mailboxConnectionId: "mailbox-1",
        externalMessageId: "new-message",
        providerThreadId: "thread-1",
        providerReplyToMessageId: null,
        inReplyTo: "<header@example.com>",
        references: [],
      },
      stored,
    );
    assert.deepEqual(result, {
      status: "CONFIRMED",
      basis: "PROVIDER_THREAD",
      matchedMessageId: "stored-thread",
    });
  });

  test("confirms RFC In-Reply-To and References only within the same mailbox", () => {
    const inReplyTo = detectReplyEvidence(
      {
        mailboxConnectionId: "mailbox-1",
        externalMessageId: "new-message",
        providerThreadId: null,
        providerReplyToMessageId: null,
        inReplyTo: " <header@example.com> ",
        references: [],
      },
      stored,
    );
    assert.equal(inReplyTo.status, "CONFIRMED");
    if (inReplyTo.status === "CONFIRMED") assert.equal(inReplyTo.basis, "IN_REPLY_TO");

    const wrongMailbox = detectReplyEvidence(
      {
        mailboxConnectionId: "mailbox-2",
        externalMessageId: "new-message",
        providerThreadId: "thread-1",
        providerReplyToMessageId: "external-thread",
        inReplyTo: "<thread@example.com>",
        references: ["<header@example.com>"],
      },
      stored,
    );
    assert.equal(wrongMailbox.status, "NOT_A_REPLY");
  });

  test("does not case-fold RFC Message-IDs when evaluating reply headers", () => {
    const result = detectReplyEvidence(
      {
        mailboxConnectionId: "mailbox-1",
        externalMessageId: "new-message",
        providerThreadId: null,
        providerReplyToMessageId: null,
        inReplyTo: "<HEADER@example.com>",
        references: [],
      },
      stored,
    );

    assert.equal(result.status, "NOT_A_REPLY");
  });

  test("keeps address/subject/time similarity review-only", () => {
    const result = detectReplyEvidence(
      {
        mailboxConnectionId: "mailbox-1",
        externalMessageId: "new-message",
        providerThreadId: null,
        providerReplyToMessageId: null,
        inReplyTo: null,
        references: [],
        hasAddressSubjectTimeSimilarity: true,
      },
      stored,
    );
    assert.deepEqual(result, {
      status: "REVIEW_REQUIRED",
      basis: "ADDRESS_SUBJECT_TIME_SIMILARITY",
      matchedMessageId: null,
    });
  });
});

describe("Sprint 4A disabled feature flags", () => {
  test("all flags default to disabled", () => {
    assert.deepEqual(getEmailFeatureFlags({}), {
      EMAIL_READ_SYNC_ENABLED: false,
      EMAIL_ZOHO_WEBHOOK_ENABLED: false,
      EMAIL_RELATIONSHIP_TIMELINE_ENABLED: false,
      EMAIL_BODY_RETENTION_ENABLED: false,
      EMAIL_SEND_V2_ENABLED: false,
    });
  });

  test("only an explicit true enables a flag; malformed values fail closed", () => {
    const flags = getEmailFeatureFlags({
      EMAIL_READ_SYNC_ENABLED: " TRUE ",
      EMAIL_ZOHO_WEBHOOK_ENABLED: "1",
      EMAIL_RELATIONSHIP_TIMELINE_ENABLED: "yes",
      EMAIL_BODY_RETENTION_ENABLED: "",
      EMAIL_SEND_V2_ENABLED: "false",
    });
    assert.equal(flags.EMAIL_READ_SYNC_ENABLED, true);
    assert.equal(flags.EMAIL_ZOHO_WEBHOOK_ENABLED, false);
    assert.equal(flags.EMAIL_RELATIONSHIP_TIMELINE_ENABLED, false);
    assert.equal(flags.EMAIL_BODY_RETENTION_ENABLED, false);
    assert.equal(flags.EMAIL_SEND_V2_ENABLED, false);
  });

  test("Netlify preview contexts cannot apply database migrations", async () => {
    const netlifyConfig = await readFile(new URL("../netlify.toml", import.meta.url), "utf8");
    const deployPreview = netlifyConfig.match(
      /\[context\.deploy-preview\]([\s\S]*?)(?=\n\[|$)/,
    )?.[1];
    const branchDeploy = netlifyConfig.match(
      /\[context\.branch-deploy\]([\s\S]*?)(?=\n\[|$)/,
    )?.[1];

    assert.ok(deployPreview, "deploy-preview context must be explicit");
    assert.ok(branchDeploy, "branch-deploy context must be explicit");
    assert.equal(deployPreview.includes("migrate"), false);
    assert.equal(branchDeploy.includes("migrate"), false);
  });
});
