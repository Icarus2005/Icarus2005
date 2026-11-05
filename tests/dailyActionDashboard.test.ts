import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDailyActionDashboard,
  dashboardViewHref,
  visibleDashboardItems,
  type DailyActionDashboardInput,
} from "../src/lib/dailyActionDashboard";

const NOW = new Date("2026-11-05T08:00:00.000Z"); // 12:00 on 5 Nov in Dubai

function openTask(overrides: Partial<DailyActionDashboardInput["tasks"][number]> = {}): DailyActionDashboardInput["tasks"][number] {
  return {
    id: "task-1",
    title: "Follow up",
    dueDate: null,
    clientCommitmentDate: null,
    status: "OPEN",
    priority: "MEDIUM",
    product: "PLACEPULSE",
    lead: null,
    opportunity: null,
    account: null,
    contact: null,
    ...overrides,
  };
}

function lead(overrides: Partial<DailyActionDashboardInput["leads"][number]> = {}): DailyActionDashboardInput["leads"][number] {
  return {
    id: "lead-1",
    name: "Lead One",
    company: "Account One",
    status: "CONTACTED",
    primaryProduct: "PLACEPULSE",
    convertedOpportunityId: null,
    nextAction: null,
    nextActionDate: null,
    createdAt: "2026-11-01T08:00:00.000Z",
    activities: [],
    tasks: [],
    ...overrides,
  };
}

function opportunity(overrides: Partial<DailyActionDashboardInput["opportunities"][number]> = {}): DailyActionDashboardInput["opportunities"][number] {
  return {
    id: "opp-1",
    name: "Opportunity One",
    product: "PLACEPULSE",
    stage: "IDENTIFIED",
    stageRef: { name: "Identified", isWon: false, isLost: false },
    healthStatus: "ON_TRACK",
    value: 100_000,
    probability: 50,
    forecastCategory: "PIPELINE",
    nextAction: null,
    nextActionDate: null,
    expectedCloseDate: null,
    closedAt: null,
    account: { id: "account-1", name: "Account One" },
    activities: [{ date: "2026-11-01T08:00:00.000Z" }],
    tasks: [{
      id: "opp-task",
      title: "Next step",
      dueDate: "2026-11-10T12:00:00.000Z",
      clientCommitmentDate: null,
      status: "OPEN",
      priority: "MEDIUM",
    }],
    ...overrides,
  };
}

function emptyInput(overrides: Partial<DailyActionDashboardInput> = {}): DailyActionDashboardInput {
  return { leads: [], opportunities: [], tasks: [], meetings: [], ...overrides };
}

describe("Commercial Maturity Sprint 2 — daily action dashboard", () => {
  it("uses Dubai calendar boundaries and prioritizes overdue before due-today Tasks", () => {
    const overdueHigh = openTask({
      id: "overdue-high",
      title: "Urgent overdue",
      dueDate: "2026-11-04T12:00:00.000Z",
      priority: "URGENT",
      lead: { id: "lead-1", name: "Lead One", primaryProduct: "PLACEPULSE" },
    });
    const overdueLow = openTask({ id: "overdue-low", title: "Low overdue", dueDate: "2026-11-04T10:00:00.000Z", priority: "LOW" });
    const dueToday = openTask({ id: "today", title: "Due today", dueDate: "2026-11-05T12:00:00.000Z", priority: "URGENT" });
    const dashboard = buildDailyActionDashboard(emptyInput({ tasks: [dueToday, overdueLow, overdueHigh] }), NOW);

    assert.deepEqual(dashboard.today.map((item) => item.key), ["task:overdue-high", "task:overdue-low", "task:today"]);
    assert.equal(dashboard.today[0].timing, "overdue");
    assert.deepEqual(dashboard.today[0].conditions, ["overdue"]);
    assert.equal(dashboard.today[2].timing, "today");
    assert.equal(dashboard.today[0].href, "/leads/lead-1");
  });

  it("puts qualified Leads without canonical next Tasks into Today with a safe creation link", () => {
    const qualified = lead({ id: "qualified", status: "QUALIFIED", nextAction: "Legacy follow-up note" });
    const dashboard = buildDailyActionDashboard(emptyInput({ leads: [qualified] }), NOW);

    assert.equal(dashboard.today.length, 1);
    assert.equal(dashboard.today[0].timing, "missing");
    assert.equal(dashboard.today[0].actionHref, "/tasks/new?leadId=qualified&product=PLACEPULSE");
    assert.match(dashboard.today[0].explanation, /canonical open next Task/);
  });

  it("surfaces every open undated Task as Needs Scheduling without inventing a date", () => {
    const undated = openTask({ id: "undated", title: "Agree next step" });
    const dashboard = buildDailyActionDashboard(emptyInput({ tasks: [undated] }), NOW);

    assert.equal(dashboard.today.length, 1);
    assert.equal(dashboard.today[0].timing, "unscheduled");
    assert.deepEqual(dashboard.today[0].conditions, ["unscheduled"]);
    assert.equal(dashboard.today[0].date, null);
    assert.equal(dashboard.today[0].actionLabel, "Schedule task");
    assert.match(dashboard.today[0].actionHref, /bucket=Needs\+Scheduling/);
  });

  it("surfaces overdue client commitments independently and never duplicates the Task card", () => {
    const commitmentOnly = openTask({
      id: "commitment-only",
      dueDate: "2026-11-09T12:00:00.000Z",
      clientCommitmentDate: "2026-11-04T12:00:00.000Z",
    });
    const bothOverdue = openTask({
      id: "both-overdue",
      dueDate: "2026-11-03T12:00:00.000Z",
      clientCommitmentDate: "2026-11-04T12:00:00.000Z",
    });
    const dashboard = buildDailyActionDashboard(emptyInput({ tasks: [commitmentOnly, bothOverdue] }), NOW);

    assert.equal(dashboard.today.length, 2);
    assert.equal(dashboard.today.filter((item) => item.key === "task:both-overdue").length, 1);
    assert.deepEqual(dashboard.today.find((item) => item.key === "task:commitment-only")?.conditions, ["commitmentOverdue"]);
    assert.deepEqual(dashboard.today.find((item) => item.key === "task:both-overdue")?.conditions, ["commitmentOverdue", "overdue"]);
  });

  it("explains every At Risk flag and reuses legacy next-action fallback without treating it as a Task", () => {
    const qualified = lead({
      id: "cooling-qualified",
      status: "QUALIFIED",
      createdAt: "2026-08-01T08:00:00.000Z",
      nextAction: "Call after budget review",
      nextActionDate: "2026-11-08T12:00:00.000Z",
    });
    const staleOpportunity = opportunity({
      id: "stale-opp",
      activities: [{ date: "2026-09-01T08:00:00.000Z" }],
      tasks: [],
      healthStatus: "AT_RISK",
    });
    const dashboard = buildDailyActionDashboard(emptyInput({ leads: [qualified], opportunities: [staleOpportunity] }), NOW);
    const leadRisk = dashboard.atRisk.find((item) => item.key === "lead:cooling-qualified");
    const opportunityRisk = dashboard.atRisk.find((item) => item.key === "opportunity:stale-opp");

    assert.ok(leadRisk);
    assert.deepEqual(leadRisk.reasons, [
      { kind: "hygiene", text: "Qualified Lead has no Opportunity." },
      { kind: "commercial", text: "No Activity in 30+ days since creation." },
      { kind: "hygiene", text: "No open Task; only the legacy next-action note remains." },
    ]);
    assert.equal(leadRisk.category, "commercial");
    assert.equal(leadRisk.nextInteraction?.source, "field");
    assert.equal(leadRisk.actionHref, "/leads/cooling-qualified/convert");
    assert.ok(opportunityRisk);
    assert.equal(opportunityRisk.reasons.length, 3);
    assert.equal(opportunityRisk.actionHref, "/tasks/new?opportunityId=stale-opp&product=PLACEPULSE");
  });

  it("flags a passed expected close date even when Activity is recent and a next Task exists", () => {
    const expiredClose = opportunity({
      id: "expired-close",
      expectedCloseDate: "2026-11-04T12:00:00.000Z",
      activities: [{ date: "2026-11-05T07:00:00.000Z" }],
    });
    const dashboard = buildDailyActionDashboard(emptyInput({ opportunities: [expiredClose] }), NOW);
    const flagged = dashboard.atRisk[0];

    assert.equal(flagged.key, "opportunity:expired-close");
    assert.equal(flagged.category, "commercial");
    assert.deepEqual(flagged.reasons, [{
      kind: "commercial",
      text: "Expected close date has passed while the Opportunity remains open.",
    }]);
    assert.equal(flagged.actionLabel, "Review deal");
  });

  it("counts commercial-risk and CRM-hygiene flags separately", () => {
    const hygieneOnly = lead({ id: "hygiene", status: "QUALIFIED" });
    const commercialAndHygiene = lead({
      id: "mixed",
      status: "QUALIFIED",
      createdAt: "2026-08-01T08:00:00.000Z",
    });
    const dashboard = buildDailyActionDashboard(emptyInput({ leads: [hygieneOnly, commercialAndHygiene] }), NOW);

    assert.equal(dashboard.atRisk.find((item) => item.key === "lead:hygiene")?.category, "hygiene");
    assert.equal(dashboard.atRisk.find((item) => item.key === "lead:mixed")?.category, "commercial");
    assert.deepEqual(dashboard.attentionSummary, { records: 2, commercialFlags: 1, hygieneFlags: 4 });
  });

  it("View all preserves product context and exposes qualified Leads beyond the prioritized limit", () => {
    const overdueTasks = Array.from({ length: 13 }, (_, index) => openTask({
      id: `overdue-${index}`,
      title: `Overdue ${index}`,
      dueDate: "2026-11-04T12:00:00.000Z",
    }));
    const qualified = lead({ id: "qualified-beyond-limit", status: "QUALIFIED" });
    const dashboard = buildDailyActionDashboard(emptyInput({ tasks: overdueTasks, leads: [qualified] }), NOW);

    assert.equal(visibleDashboardItems(dashboard.today, 12, false).some((item) => item.key === "lead-next-task:qualified-beyond-limit"), false);
    assert.equal(visibleDashboardItems(dashboard.today, 12, true).some((item) => item.key === "lead-next-task:qualified-beyond-limit"), true);
    assert.equal(dashboardViewHref("PLACEPULSE", "today"), "/?product=PLACEPULSE&view=today#today-heading");
  });

  it("excludes won/lost records from At Risk and approaching-close sections", () => {
    const won = opportunity({
      id: "won",
      stage: "CLOSED_WON",
      stageRef: { name: "Won", isWon: true, isLost: false },
      expectedCloseDate: "2026-11-07T12:00:00.000Z",
      tasks: [],
      activities: [],
    });
    const dashboard = buildDailyActionDashboard(emptyInput({ opportunities: [won] }), NOW);

    assert.equal(dashboard.atRisk.length, 0);
    assert.equal(dashboard.upcoming.length, 0);
    assert.equal(dashboard.metrics.openOpportunities, 0);
  });

  it("orders upcoming recorded commitments, meetings, Tasks and close dates chronologically", () => {
    const task = openTask({
      id: "upcoming-task",
      title: "Prepare brief",
      dueDate: "2026-11-08T12:00:00.000Z",
      clientCommitmentDate: "2026-11-06T12:00:00.000Z",
      opportunity: { id: "opp-1", name: "Opportunity One", product: "PLACEPULSE" },
    });
    const meeting: DailyActionDashboardInput["meetings"][number] = {
      id: "meeting-1",
      title: "Recorded planning meeting",
      meetingDate: "2026-11-07T12:00:00.000Z",
      detectedProduct: "PLACEPULSE",
      account: { id: "account-1", name: "Account One" },
      contact: null,
      lead: null,
    };
    const closing = opportunity({ id: "closing", expectedCloseDate: "2026-11-09T12:00:00.000Z" });
    const dashboard = buildDailyActionDashboard(emptyInput({ tasks: [task], meetings: [meeting], opportunities: [closing] }), NOW);

    assert.deepEqual(dashboard.upcoming.map((item) => item.type), ["commitment", "meeting", "close"]);
    assert.equal(dashboard.upcoming[0].explanation, "Internal target and recorded client commitment; both dates are shown.");
    assert.deepEqual(dashboard.upcoming[0].relatedDates?.map((item) => item.type), ["commitment", "task"]);
    assert.equal(dashboard.upcoming[1].href, "/accounts/account-1");
    assert.equal(dashboard.upcoming[2].href, "/opportunities/closing");
  });

  it("includes the seventh Dubai day, excludes the next boundary, and keeps undated records unscheduled", () => {
    const included = openTask({ id: "included", dueDate: "2026-11-12T12:00:00.000Z" });
    const excluded = openTask({ id: "excluded", dueDate: "2026-11-12T20:00:00.000Z" });
    const undated = openTask({ id: "undated", dueDate: null, clientCommitmentDate: null });
    const dashboard = buildDailyActionDashboard(emptyInput({ tasks: [included, excluded, undated] }), NOW);

    assert.deepEqual(dashboard.upcoming.map((item) => item.key), ["task-schedule:included"]);
    assert.deepEqual(dashboard.today.map((item) => item.key), ["task:undated"]);
    assert.equal(dashboard.today[0].date, null);
  });

  it("retains compact pipeline metrics from recorded values only", () => {
    const pipeline = opportunity({ value: 100_000, probability: 40, forecastCategory: "COMMIT" });
    const dashboard = buildDailyActionDashboard(emptyInput({
      leads: [lead(), lead({ id: "disqualified", status: "DISQUALIFIED" })],
      opportunities: [pipeline],
    }), NOW);

    assert.deepEqual(dashboard.metrics, {
      activeLeads: 1,
      openOpportunities: 1,
      pipelineValue: 100_000,
      weightedValue: 40_000,
      commitValue: 100_000,
      stages: [{ key: "IDENTIFIED", name: "Identified", count: 1, value: 100_000 }],
    });
  });

  it("returns useful empty collections without manufacturing actions", () => {
    const dashboard = buildDailyActionDashboard(emptyInput(), NOW);
    assert.deepEqual(dashboard.today, []);
    assert.deepEqual(dashboard.atRisk, []);
    assert.deepEqual(dashboard.upcoming, []);
  });
});
