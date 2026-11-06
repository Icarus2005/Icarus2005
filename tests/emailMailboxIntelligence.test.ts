import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { MailboxReadError } from "../src/lib/email/mailbox";
import { buildRelationshipTimeline } from "../src/lib/relationshipMemory";
import {
  getMailboxSyncConfig,
  initialLookbackFrom,
  nextRetryAt,
} from "../src/lib/email/syncConfig";
import { extractZohoAddresses, ZohoMailboxReader } from "../src/lib/email/zohoReader";
import { synchronizeMailbox } from "../src/lib/email/synchronization";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Sprint 4B Zoho read adapter", () => {
  test("uses only metadata/header GETs and strips bodies, snippets, attachments and raw headers", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const privateMarkers = {
      summary: "PRIVATE-SNIPPET",
      content: "PRIVATE-BODY",
      attachments: [{ name: "PRIVATE-ATTACHMENT.pdf" }],
      Authorization: ["PRIVATE-RAW-HEADER"],
    };
    const fetchMock: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET" });
      if (url.includes("/messages/view?")) {
        return jsonResponse({ data: [{
          messageId: "message-1",
          threadId: "thread-1",
          folderId: "folder-inbox",
          fromAddress: "Person@Example.com",
          toAddress: "&quot;Mailbox&quot;&lt;mailbox@example.com&gt;",
          ccAddress: "Not Provided",
          subject: "Metadata subject",
          sentDateInGMT: "1793966400000",
          receivedTime: "1793966401000",
          ...privateMarkers,
        }] });
      }
      if (url.endsWith("/details")) {
        return jsonResponse({ data: {
          messageId: "message-1",
          threadId: "thread-1",
          folderId: "folder-inbox",
          fromAddress: "Person@Example.com",
          toAddress: "Mailbox <mailbox@example.com>",
          ccAddress: "Copy <copy@example.com>",
          subject: "Metadata subject",
          sentDateInGMT: "1793966400000",
          receivedTime: "1793966401000",
          ...privateMarkers,
        } });
      }
      if (url.includes("/header?raw=false")) {
        return jsonResponse({ data: { headerContent: {
          "Message-Id": ["<Case.Root@Example.com>"],
          "In-Reply-To": ["<Prior.Root@Example.com>"],
          References: ["<First@Example.com> <Prior.Root@Example.com>"],
          ...privateMarkers,
        } } });
      }
      throw new Error(`Unexpected URL ${url}`);
    };

    const reader = new ZohoMailboxReader({
      accountId: "zoho-account",
      providerAccountKey: "zoho-account",
      mailboxAddress: "mailbox@example.com",
      folderId: "folder-inbox",
      folderKey: "inbox",
      direction: "INBOUND",
      dataRegion: "ae",
      pageSize: 100,
      accessToken: async () => "mock-read-token",
    }, fetchMock);

    const page = await reader.listMessages({ overlapFrom: "2026-10-01T00:00:00.000Z" });
    const message = await reader.getMessageMetadata(page.messages[0].externalMessageId);
    const serialized = JSON.stringify(message);

    assert.equal(message.internetMessageId, "Case.Root@Example.com");
    assert.equal(message.inReplyTo, "Prior.Root@Example.com");
    assert.deepEqual(message.references, ["First@Example.com", "Prior.Root@Example.com"]);
    assert.deepEqual(message.toAddresses, ["mailbox@example.com"]);
    assert.deepEqual(message.ccAddresses, ["copy@example.com"]);
    assert.ok(calls.every((call) => call.method === "GET"));
    assert.ok(calls.every((call) => !/content|attachment|originalmessage/i.test(call.url)));
    assert.ok(calls.some((call) => call.url.startsWith("https://mail.zoho.ae/")));
    for (const forbidden of [
      "summary", "content", "attachments", "Authorization",
      "PRIVATE-SNIPPET", "PRIVATE-BODY", "PRIVATE-ATTACHMENT", "PRIVATE-RAW-HEADER",
    ]) {
      assert.equal(serialized.includes(forbidden), false, `metadata leaked ${forbidden}`);
    }
  });

  test("parses display-name address lists without retaining display names", () => {
    assert.deepEqual(
      extractZohoAddresses('"Person One" <ONE@example.com>, Person Two &lt;two@example.com&gt;'),
      ["one@example.com", "two@example.com"],
    );
  });

  test("classifies provider outages without including response bodies", async () => {
    const reader = new ZohoMailboxReader({
      accountId: "account",
      providerAccountKey: "account",
      mailboxAddress: "mailbox@example.com",
      folderId: "folder",
      folderKey: "inbox",
      direction: "INBOUND",
      dataRegion: "com",
      pageSize: 100,
      accessToken: async () => "token",
    }, async () => new Response("PRIVATE PROVIDER ERROR", { status: 503 }));

    await assert.rejects(reader.listMessages({}), (error: unknown) => {
      assert.ok(error instanceof MailboxReadError);
      assert.equal(error.code, "ZOHO_UNAVAILABLE");
      assert.equal(error.message.includes("PRIVATE PROVIDER ERROR"), false);
      return true;
    });
  });
});

describe("Sprint 4B reconciliation configuration", () => {
  test("the runtime exits before database or provider access while the flag is disabled", async () => {
    const reader = {
      listMessages: async () => { throw new Error("provider must not be called"); },
      getMessageMetadata: async () => { throw new Error("provider must not be called"); },
    };
    const result = await synchronizeMailbox({
      prisma: null as unknown as PrismaClient,
      connectionId: "not-read",
      folderKey: "inbox",
      reader,
      environment: {},
    });
    assert.deepEqual(result, { status: "DISABLED", processed: 0, reason: "FEATURE_FLAG" });
  });

  test("defaults to a 30-minute schedule and 30-day initial lookback", () => {
    const config = getMailboxSyncConfig({});
    assert.equal(config.intervalMinutes, 30);
    assert.equal(config.initialLookbackDays, 30);
    assert.equal(config.pageSize, 5);
    assert.equal(
      initialLookbackFrom(new Date("2026-11-06T00:00:00.000Z"), config).toISOString(),
      "2026-10-07T00:00:00.000Z",
    );
  });

  test("keeps every synchronization/content flag disabled in the deployment template", async () => {
    const envTemplate = await readFile(new URL("../.env.example", import.meta.url), "utf8");
    for (const flag of [
      "EMAIL_READ_SYNC_ENABLED",
      "EMAIL_ZOHO_WEBHOOK_ENABLED",
      "EMAIL_RELATIONSHIP_TIMELINE_ENABLED",
      "EMAIL_BODY_RETENTION_ENABLED",
      "EMAIL_SEND_V2_ENABLED",
    ]) {
      assert.match(envTemplate, new RegExp(`^${flag}="false"$`, "m"));
    }
    const scheduler = await readFile(new URL("../netlify/functions/email-reconcile.ts", import.meta.url), "utf8");
    assert.match(scheduler, /schedule:\s*"\*\/30 \* \* \* \*"/);
    assert.ok(scheduler.indexOf("EMAIL_READ_SYNC_ENABLED") < scheduler.indexOf("new PrismaClient"));
  });

  test("bounds unsafe values and applies capped exponential retry", () => {
    const config = getMailboxSyncConfig({
      EMAIL_RECONCILE_INTERVAL_MINUTES: "1",
      EMAIL_INITIAL_LOOKBACK_DAYS: "999",
      EMAIL_RECONCILE_PAGE_SIZE: "201",
      EMAIL_RETRY_BASE_MINUTES: "5",
      EMAIL_RETRY_MAX_MINUTES: "60",
    });
    assert.equal(config.intervalMinutes, 30);
    assert.equal(config.initialLookbackDays, 30);
    assert.equal(config.pageSize, 5);
    assert.equal(
      nextRetryAt(new Date("2026-11-06T00:00:00.000Z"), 9, config).toISOString(),
      "2026-11-06T01:00:00.000Z",
    );
  });
});

describe("Sprint 4B relationship-memory email entries", () => {
  test("shows metadata-only correspondence and reply evidence without an editable link", () => {
    const entries = buildRelationshipTimeline({
      activities: [],
      meetings: [],
      proposals: [],
      emails: [{
        id: "email-1",
        direction: "INBOUND",
        subject: "Re: Pilot",
        providerSentAt: "2026-11-06T10:00:00.000Z",
        replyState: "CONFIRMED",
        replyBasis: "IN_REPLY_TO",
        provenance: "Mailbox metadata · exact Contact email match",
      }],
    });
    assert.deepEqual(entries[0], {
      key: "email:email-1",
      kind: "email",
      label: "Email received",
      title: "Re: Pilot",
      detail: "Confirmed reply · IN_REPLY_TO",
      date: "2026-11-06T10:00:00.000Z",
      href: null,
      provenance: "Mailbox metadata · exact Contact email match",
      product: null,
    });
  });
});
