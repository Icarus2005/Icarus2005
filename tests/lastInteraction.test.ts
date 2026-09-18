import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { deriveLastInteraction } from "@/lib/nextInteraction";

describe("deriveLastInteraction — Activity is the source of truth for what happened", () => {
  test("picks the most recent activity regardless of input order", () => {
    const last = deriveLastInteraction([
      { type: "CALL", subject: "Intro call", date: "2026-01-01" },
      { type: "MEETING", subject: "Follow-up meeting", date: "2026-03-01" },
      { type: "EMAIL", subject: "Sent deck", date: "2026-02-01" },
    ]);
    assert.equal(last?.label, "Follow-up meeting");
    assert.equal(last?.type, "MEETING");
  });

  test("returns null when there are no activities", () => {
    assert.equal(deriveLastInteraction([]), null);
  });

  test("does not read Lead.lastActivityAt or any denormalized field — only the activities it's given", () => {
    const last = deriveLastInteraction([{ type: "NOTE", subject: "Only activity", date: "2026-01-15" }]);
    assert.equal(last?.label, "Only activity");
  });
});
