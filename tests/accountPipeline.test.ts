import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { summarizeOpenOpportunityPipeline } from "../src/lib/crmHealth";

describe("Account relationship memory — open pipeline summary", () => {
  test("counts and values only genuinely open Opportunities", () => {
    const summary = summarizeOpenOpportunityPipeline([
      { stage: "QUALIFIED", stageRef: { isWon: false, isLost: false }, closedAt: null, value: 125_000 },
      { stage: "WON", stageRef: { isWon: true, isLost: false }, closedAt: null, value: 500_000 },
      { stage: "LOST", stageRef: { isWon: false, isLost: true }, closedAt: null, value: 300_000 },
      { stage: "PROPOSAL", stageRef: { isWon: false, isLost: false }, closedAt: "2026-10-31T12:00:00.000Z", value: 75_000 },
    ]);

    assert.deepEqual(summary, { openDealCount: 1, pipelineValue: 125_000 });
  });

  test("excludes legacy CLOSED_* stages when stage metadata is unavailable", () => {
    const summary = summarizeOpenOpportunityPipeline([
      { stage: "CLOSED_WON", stageRef: null, closedAt: null, value: 90_000 },
      { stage: "closed_lost", stageRef: null, closedAt: null, value: 40_000 },
      { stage: "DISCOVERY", stageRef: null, closedAt: null, value: 25_000 },
    ]);

    assert.deepEqual(summary, { openDealCount: 1, pipelineValue: 25_000 });
  });

  test("keeps open unvalued Opportunities in the count without inventing value", () => {
    const summary = summarizeOpenOpportunityPipeline([
      { stage: "DISCOVERY", stageRef: { isWon: false, isLost: false }, closedAt: null, value: null },
      { stage: "PROPOSAL", stageRef: { isWon: false, isLost: false }, closedAt: null },
    ]);

    assert.deepEqual(summary, { openDealCount: 2, pipelineValue: 0 });
  });
});
