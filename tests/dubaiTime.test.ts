import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { startOfDubaiDay, addDubaiDays, isOverdueDubai } from "@/lib/dubaiTime";
import { isOverdue } from "@/lib/format";

describe("startOfDubaiDay — Asia/Dubai is UTC+4, no DST", () => {
  test("returns the UTC instant of Dubai midnight for a date already at Dubai midnight", () => {
    // 2026-09-20T00:00:00+04:00 == 2026-09-19T20:00:00Z
    const start = startOfDubaiDay("2026-09-19T20:00:00.000Z");
    assert.equal(start.toISOString(), "2026-09-19T20:00:00.000Z");
  });

  test("floors a mid-day Dubai instant to that same Dubai day's start", () => {
    // 2026-09-20T15:30:00+04:00 == 2026-09-20T11:30:00Z
    const start = startOfDubaiDay("2026-09-20T11:30:00.000Z");
    assert.equal(start.toISOString(), "2026-09-19T20:00:00.000Z");
  });

  test("an instant just before Dubai midnight floors to the PREVIOUS Dubai day", () => {
    // 2026-09-19T23:59:59+04:00 == 2026-09-19T19:59:59Z
    const start = startOfDubaiDay("2026-09-19T19:59:59.000Z");
    assert.equal(start.toISOString(), "2026-09-18T20:00:00.000Z");
  });
});

describe("addDubaiDays", () => {
  test("adds whole calendar days", () => {
    const day1 = startOfDubaiDay("2026-09-19T20:00:00.000Z");
    const day2 = addDubaiDays(day1, 1);
    assert.equal(day2.toISOString(), "2026-09-20T20:00:00.000Z");
  });
});

describe("isOverdueDubai — the Sprint 06A midnight-rollover fix", () => {
  const dueTodayMidnightDubai = "2026-09-19T20:00:00.000Z"; // = 2026-09-20T00:00+04:00, "due 20 Sep"

  test("a task due today is NOT overdue at the instant its Dubai day begins (the original bug)", () => {
    assert.equal(isOverdueDubai(dueTodayMidnightDubai, "2026-09-19T20:00:00.000Z"), false);
  });

  test("a task due today is NOT overdue at any point during that Dubai day, including 23:59:59 local", () => {
    // 2026-09-20T23:59:59+04:00 == 2026-09-20T19:59:59Z, still within the due day
    assert.equal(isOverdueDubai(dueTodayMidnightDubai, "2026-09-20T19:59:59.000Z"), false);
  });

  test("a task due today becomes overdue only once the NEXT Dubai calendar day begins", () => {
    // 2026-09-21T00:00:00+04:00 == 2026-09-20T20:00:00Z
    assert.equal(isOverdueDubai(dueTodayMidnightDubai, "2026-09-20T20:00:00.000Z"), true);
  });

  test("a task due tomorrow (21 Sep) is not overdue during 20 Sep or during 21 Sep, only from 22 Sep", () => {
    const dueTomorrow = "2026-09-20T20:00:00.000Z"; // = 2026-09-21T00:00+04:00, "due 21 Sep"
    assert.equal(isOverdueDubai(dueTomorrow, "2026-09-19T20:00:00.000Z"), false); // now = start of 20 Sep
    assert.equal(isOverdueDubai(dueTomorrow, "2026-09-20T19:59:59.000Z"), false); // now = end of 20 Sep, still today
    assert.equal(isOverdueDubai(dueTomorrow, "2026-09-20T20:00:00.000Z"), false); // now = start of 21 Sep, due day itself
    assert.equal(isOverdueDubai(dueTomorrow, "2026-09-21T19:59:59.000Z"), false); // now = end of 21 Sep, still due day
    assert.equal(isOverdueDubai(dueTomorrow, "2026-09-21T20:00:00.000Z"), true); // now = start of 22 Sep, day has passed
  });

  test("null/undefined due dates are never overdue", () => {
    assert.equal(isOverdueDubai(null), false);
    assert.equal(isOverdueDubai(undefined), false);
  });

  test("the shared format.ts isOverdue delegates to the same Dubai-day logic", () => {
    assert.equal(isOverdue(dueTodayMidnightDubai), isOverdueDubai(dueTodayMidnightDubai));
  });
});
