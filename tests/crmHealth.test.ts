import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildCrmHealth, type CrmHealthInput } from "../src/lib/crmHealth";

const now = new Date("2026-11-04T12:00:00.000Z");
const recent = new Date("2026-11-01T12:00:00.000Z");
const stale = new Date("2026-07-01T12:00:00.000Z");

function emptyInput(): CrmHealthInput {
  return { accounts: [], contacts: [], leads: [], opportunities: [], tasks: [], activities: [] };
}

function issue(input: CrmHealthInput, key: string) {
  return buildCrmHealth(input, now).issues.find((item) => item.key === key)!;
}

describe("CRM Health rules", () => {
  test("reports duplicate candidates without exposing merge or delete actions", () => {
    const input = emptyInput();
    input.accounts = [
      { id: "a1", name: "Example Holdings", createdAt: recent, activities: [{ date: recent }], accountProducts: [] },
      { id: "a2", name: " example-holdings ", createdAt: recent, activities: [{ date: recent }], accountProducts: [] },
    ];
    input.contacts = [
      { id: "c1", firstName: "Sam", lastName: "Lee", email: "sam@example.com", accountId: "a1", account: { name: "Example Holdings" }, createdAt: recent, activities: [{ date: recent }] },
      { id: "c2", firstName: "Sam", lastName: "Lee", email: "SAM@example.com", accountId: "a1", account: { name: "Example Holdings" }, createdAt: recent, activities: [{ date: recent }] },
    ];
    input.leads = [
      { id: "l1", name: "Sam Lee", company: "Example Holdings", status: "NEW", primaryProduct: "PLACEPULSE", accountId: "a1", primaryContactId: "c1", convertedOpportunityId: null, createdAt: recent, activities: [{ date: recent }], tasks: [{ status: "OPEN" }] },
      { id: "l2", name: " sam lee ", company: "example-holdings", status: "NEW", primaryProduct: "PLACEPULSE", accountId: "a1", primaryContactId: "c2", convertedOpportunityId: null, createdAt: recent, activities: [{ date: recent }], tasks: [{ status: "OPEN" }] },
    ];

    assert.equal(issue(input, "duplicate-accounts").records.length, 2);
    assert.equal(issue(input, "duplicate-contact-emails").records.length, 2);
    assert.equal(issue(input, "duplicate-contact-names").records.length, 2);
    assert.equal(issue(input, "duplicate-leads").records.length, 2);
    const actions = buildCrmHealth(input, now).issues.flatMap((item) => item.records).map((item) => item.actionLabel ?? "");
    assert.equal(actions.some((action) => /merge|delete/i.test(action)), false);
  });

  test("surfaces incomplete qualified Leads with direct review, conversion, and Task paths", () => {
    const input = emptyInput();
    input.leads = [{
      id: "l1", name: "Qualified Person", company: "New Co", status: "QUALIFIED", primaryProduct: "PLACEPULSE",
      accountId: null, primaryContactId: null, convertedOpportunityId: null, createdAt: recent,
      activities: [{ date: recent }], tasks: [],
    }];

    assert.equal(issue(input, "leads-without-accounts").records[0].actionHref, "/leads/l1/edit");
    assert.equal(issue(input, "leads-without-contacts").records[0].actionHref, "/leads/l1/edit");
    assert.equal(issue(input, "qualified-without-opportunity").records[0].actionHref, "/leads/l1/convert");
    assert.equal(issue(input, "qualified-without-task").records[0].actionHref, "/tasks/new?leadId=l1&product=PLACEPULSE");
  });

  test("surfaces open Opportunities without contacts, recent Activity, or open Tasks", () => {
    const input = emptyInput();
    input.opportunities = [{
      id: "o1", name: "At-risk Deal", accountId: "a1", product: "ADVISORY", stage: "DISCOVERY", createdAt: stale,
      stageRef: { isWon: false, isLost: false }, contacts: [], activities: [{ date: stale }], tasks: [{ status: "DONE" }],
    }];

    assert.equal(issue(input, "opportunities-without-contacts").records.length, 1);
    assert.equal(issue(input, "opportunities-without-activity").records[0].actionHref, "/activities/new?opportunityId=o1&product=ADVISORY");
    assert.equal(issue(input, "opportunities-without-task").records[0].actionHref, "/tasks/new?opportunityId=o1&product=ADVISORY");
  });

  test("uses Dubai due-day semantics and finds orphan Tasks and Activities", () => {
    const input = emptyInput();
    input.tasks = [
      { id: "t1", title: "Past due", status: "OPEN", dueDate: "2026-11-02T20:00:00.000Z", leadId: "l1", accountId: null, contactId: null, opportunityId: null },
      { id: "t2", title: "Orphan", status: "OPEN", dueDate: null, leadId: null, accountId: null, contactId: null, opportunityId: null },
    ];
    input.activities = [{ id: "x1", subject: "Unlinked note", leadId: null, accountId: null, contactId: null, opportunityId: null }];

    assert.deepEqual(issue(input, "overdue-tasks").records.map((item) => item.id), ["t1"]);
    assert.deepEqual(issue(input, "orphan-tasks").records.map((item) => item.id), ["t2"]);
    assert.deepEqual(issue(input, "orphan-activities").records.map((item) => item.id), ["x1"]);
  });

  test("shows upcoming commitments using a configurable Dubai calendar window", () => {
    const input = emptyInput();
    input.tasks = [
      { id: "today", title: "Due today", status: "OPEN", dueDate: "2026-11-04T20:00:00.000Z", leadId: "l1", accountId: null, contactId: null, opportunityId: null },
      { id: "soon", title: "Due soon", status: "OPEN", dueDate: "2026-11-06T12:00:00.000Z", leadId: "l1", accountId: null, contactId: null, opportunityId: null },
      { id: "later", title: "Due later", status: "OPEN", dueDate: "2026-11-07T20:00:00.000Z", leadId: "l1", accountId: null, contactId: null, opportunityId: null },
    ];

    const health = buildCrmHealth(input, now, {
      recentOpportunityActivityDays: 30,
      staleLeadDays: 30,
      staleRelationshipDays: 90,
      upcomingCommitmentDays: 2,
    });
    const upcoming = health.issues.find((item) => item.key === "upcoming-tasks")!;
    assert.deepEqual(upcoming.records.map((item) => item.id), ["today", "soon"]);
    assert.equal(health.thresholds.upcomingCommitmentDays, 2);
  });

  test("finds missing product assignment and stale relationship records at documented thresholds", () => {
    const input = emptyInput();
    input.accounts = [{ id: "a1", name: "Stale Account", createdAt: stale, activities: [], accountProducts: [] }];
    input.contacts = [{ id: "c1", firstName: "Stale", lastName: "Contact", email: null, accountId: "a1", account: { name: "Stale Account" }, createdAt: stale, activities: [] }];
    input.leads = [{ id: "l1", name: "Stale Lead", company: "Stale Account", status: "CONTACTED", primaryProduct: "UNASSIGNED", accountId: "a1", primaryContactId: "c1", convertedOpportunityId: null, createdAt: stale, activities: [], tasks: [] }];
    input.opportunities = [{ id: "o1", name: "Unassigned Deal", accountId: "a1", product: "UNASSIGNED", stage: "DISCOVERY", createdAt: recent, stageRef: { isWon: false, isLost: false }, contacts: [{ contactId: "c1", isPrimary: true }], activities: [{ date: recent }], tasks: [{ status: "OPEN" }] }];

    assert.deepEqual(issue(input, "missing-product").records.map((item) => item.id).sort(), ["l1", "o1"]);
    assert.equal(issue(input, "stale-leads").records.length, 1);
    assert.equal(issue(input, "stale-accounts").records.length, 1);
    assert.equal(issue(input, "stale-contacts").records.length, 1);
  });

  test("flags Account product coverage implied by linked records without changing it", () => {
    const input = emptyInput();
    input.accounts = [{
      id: "a1", name: "Coverage Co", createdAt: recent, activities: [{ date: recent }],
      accountProducts: [{ productKey: "ADVISORY" }],
    }];
    input.leads = [{
      id: "l1", name: "Prospect", company: "Coverage Co", status: "CONTACTED", primaryProduct: "PLACEPULSE",
      accountId: "a1", primaryContactId: "c1", convertedOpportunityId: null, createdAt: recent,
      activities: [{ date: recent }], tasks: [{ status: "OPEN" }],
    }];
    input.opportunities = [{
      id: "o1", name: "Advisory Deal", accountId: "a1", product: "ADVISORY", stage: "DISCOVERY",
      createdAt: recent, stageRef: { isWon: false, isLost: false }, contacts: [{ contactId: "c1", isPrimary: true }],
      activities: [{ date: recent }], tasks: [{ status: "OPEN" }],
    }];

    const coverage = issue(input, "inconsistent-product-coverage");
    assert.equal(coverage.records.length, 1);
    assert.match(coverage.records[0].detail ?? "", /PLACEPULSE/);
    assert.equal(coverage.records[0].actionHref, "/accounts/a1");
  });

  test("reports healthy rules explicitly when no findings exist", () => {
    const health = buildCrmHealth(emptyInput(), now);
    assert.equal(health.summary.healthyRules, health.summary.totalRules);
    assert.equal(health.summary.totalRules, 20);
  });
});
