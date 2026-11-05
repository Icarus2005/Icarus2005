import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildProductEvidence,
  buildRelationshipTimeline,
  deriveRelationshipNextAction,
  relationshipTaskConditions,
  type RelationshipTaskRef,
} from "../src/lib/relationshipMemory";

const task = (overrides: Partial<RelationshipTaskRef> = {}): RelationshipTaskRef => ({
  id: "task-1",
  title: "Follow up",
  status: "OPEN",
  dueDate: null,
  clientCommitmentDate: null,
  href: "/tasks",
  provenance: "Direct Task",
  ...overrides,
});

describe("Sprint 3 relationship memory", () => {
  it("builds one chronological timeline without converting or duplicating source records", () => {
    const activity = {
      id: "shared-id", type: "CALL", subject: "Discovery call", notes: "Recorded note",
      date: "2026-11-02T08:00:00.000Z", href: "/activities", provenance: "Direct Activity",
    };
    const timeline = buildRelationshipTimeline({
      activities: [activity, activity],
      meetings: [{
        id: "shared-id", title: "Planning meeting", meetingDate: "2026-11-03T08:00:00.000Z",
        source: "MANUAL", href: "/meetings", provenance: "Direct Meeting",
      }],
      proposals: [{
        id: "proposal-1", title: "Commercial proposal", stage: "REVIEW",
        createdAt: "2026-11-04T08:00:00.000Z", href: "/proposals/proposal-1", provenance: "Direct Proposal",
      }],
    });

    assert.deepEqual(timeline.map((entry) => entry.key), ["proposal:proposal-1", "meeting:shared-id", "activity:shared-id"]);
    assert.deepEqual(timeline.map((entry) => entry.kind), ["proposal", "meeting", "activity"]);
    assert.equal(timeline[1].provenance, "Direct Meeting");
  });

  it("keeps recorded Account Product state distinct from derived product evidence", () => {
    const products = buildProductEvidence({
      accountProducts: [{ productKey: "PLACEPULSE", relationshipState: "PARTNER" }],
      leads: [{ primaryProduct: "PLACEPULSE", secondaryProducts: "PLYMIO,NOT_REAL" }],
      opportunities: [{ product: "AI_NAVIGATOR" }],
      activities: [{ product: "UNASSIGNED" }],
    });

    assert.deepEqual(products.map((product) => product.key), ["PLACEPULSE", "PLYMIO", "AI_NAVIGATOR"]);
    assert.equal(products[0].recordedRelationship, "PARTNER");
    assert.deepEqual(products[0].sources, ["Account product record", "Linked Lead (primary)"]);
    assert.equal(products[1].recordedRelationship, null);
  });

  it("uses the nearest canonical open Task before every legacy summary", () => {
    const next = deriveRelationshipNextAction([
      task({ id: "later", title: "Later Task", dueDate: "2026-11-20T08:00:00.000Z" }),
      task({ id: "nearest", title: "Nearest Task", dueDate: "2026-11-10T08:00:00.000Z", clientCommitmentDate: "2026-11-12T08:00:00.000Z" }),
      task({ id: "done", title: "Completed Task", status: "DONE", dueDate: "2026-11-01T08:00:00.000Z" }),
    ], [{ label: "Legacy note", date: "2026-11-06T08:00:00.000Z", href: "/leads/1", provenance: "Lead fallback" }]);

    assert.equal(next?.source, "task");
    assert.equal(next?.label, "Nearest Task");
    assert.equal(next?.clientCommitmentDate, "2026-11-12T08:00:00.000Z");
  });

  it("uses an undated canonical Task before a legacy fallback", () => {
    const next = deriveRelationshipNextAction([task({ title: "Schedule discovery" })], [
      { label: "Legacy note", date: "2026-11-06T08:00:00.000Z", href: "/leads/1", provenance: "Lead fallback" },
    ]);
    assert.equal(next?.source, "task");
    assert.equal(next?.date, null);
  });

  it("labels the legacy fallback only when no open Task exists", () => {
    const next = deriveRelationshipNextAction([task({ status: "DONE" })], [
      { label: "Call after budget review", date: null, href: "/opportunities/1", provenance: "Opportunity legacy summary" },
    ]);
    assert.deepEqual(next, {
      label: "Call after budget review",
      date: null,
      clientCommitmentDate: null,
      href: "/opportunities/1",
      provenance: "Opportunity legacy summary",
      source: "legacy",
    });
  });

  it("keeps Dubai overdue commitments, internal targets and scheduling gaps separate", () => {
    const now = new Date("2026-11-05T08:00:00.000Z");
    assert.deepEqual(relationshipTaskConditions(task({
      dueDate: "2026-11-04T08:00:00.000Z",
      clientCommitmentDate: "2026-11-03T08:00:00.000Z",
    }), now), ["OVERDUE_COMMITMENT", "OVERDUE_INTERNAL"]);
    assert.deepEqual(relationshipTaskConditions(task({ dueDate: null }), now), ["NEEDS_SCHEDULING"]);
    assert.deepEqual(relationshipTaskConditions(task({ dueDate: "2026-11-05T08:00:00.000Z" }), now), []);
  });

  it("returns explicit empty relationship memory without manufacturing facts", () => {
    assert.deepEqual(buildRelationshipTimeline({ activities: [], meetings: [], proposals: [] }), []);
    assert.deepEqual(buildProductEvidence({}), []);
    assert.equal(deriveRelationshipNextAction([], []), null);
  });
});
