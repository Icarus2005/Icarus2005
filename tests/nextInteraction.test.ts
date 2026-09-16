import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { deriveNextInteraction } from "@/lib/nextInteraction";

describe("deriveNextInteraction — Task is the source of truth for what's next", () => {
  test("prefers the nearest open (dated) task over the legacy nextAction field", () => {
    const next = deriveNextInteraction(
      [
        { title: "Send follow-up email", dueDate: "2026-10-01" },
        { title: "Book demo", dueDate: "2026-09-20" },
      ],
      "Stale legacy action",
      "2026-01-01"
    );
    assert.equal(next?.label, "Book demo");
    assert.equal(next?.source, "task");
  });

  test("falls back to an undated open task over the legacy field", () => {
    const next = deriveNextInteraction([{ title: "Review proposal", dueDate: null }], "Legacy action", "2026-01-01");
    assert.equal(next?.label, "Review proposal");
    assert.equal(next?.date, null);
    assert.equal(next?.source, "task");
  });

  test("falls back to the legacy nextAction field when there is no open task", () => {
    const next = deriveNextInteraction([], "Send benchmark teaser", "2026-07-20");
    assert.equal(next?.label, "Send benchmark teaser");
    assert.equal(next?.source, "field");
  });

  test("returns null when there is neither an open task nor a legacy field", () => {
    const next = deriveNextInteraction([], null, null);
    assert.equal(next, null);
  });

  test("does not combine task and field into one value (no conflicting source of truth)", () => {
    const next = deriveNextInteraction([{ title: "Task wins", dueDate: "2026-05-01" }], "Field loses", "2026-04-01");
    assert.equal(next?.label, "Task wins");
    assert.ok(!next?.label.includes("Field loses"));
  });
});
