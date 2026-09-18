// ─── Next interaction ────────────────────────────────────────────────────────
// Operational rule for "what's next" across the CRM:
//   - Activity  = historical interaction (canonical record of what happened)
//   - Task      = future commitment/action (canonical record of what's planned)
//   - Lead.nextAction / Opportunity.nextAction = a denormalized summary field
//     only. It may still be set and edited directly, but it is never the
//     source of truth for "next interaction" — the nearest open Task is.
//
// UI that shows a "Next Interaction" should call `deriveNextInteraction`
// with the record's open tasks (soonest due date first) and its legacy
// nextAction/nextActionDate fields as a fallback for records that predate
// task-based planning or have no open task yet.

export type OpenTaskRef = {
  title: string;
  dueDate: Date | string | null;
};

export type NextInteraction = {
  label: string;
  date: Date | string | null;
  source: "task" | "field";
} | null;

/**
 * Prefer the nearest open Task; fall back to the legacy nextAction field
 * when no open task exists. Never combines the two into one value — that
 * would recreate the conflicting-source-of-truth problem this replaces.
 */
export function deriveNextInteraction(
  openTasks: OpenTaskRef[],
  legacyNextAction: string | null | undefined,
  legacyNextActionDate: Date | string | null | undefined
): NextInteraction {
  const nearestTask = [...openTasks]
    .filter((t) => t.dueDate)
    .sort((a, b) => new Date(a.dueDate as string).getTime() - new Date(b.dueDate as string).getTime())[0];

  if (nearestTask) {
    return { label: nearestTask.title, date: nearestTask.dueDate, source: "task" };
  }
  // No dated open task — fall back to an undated open task if one exists.
  const undatedTask = openTasks[0];
  if (undatedTask) {
    return { label: undatedTask.title, date: null, source: "task" };
  }
  if (legacyNextAction) {
    return { label: legacyNextAction, date: legacyNextActionDate ?? null, source: "field" };
  }
  return null;
}

// ─── Last interaction ───────────────────────────────────────────────────────
// Always derived from the most recent Activity — never a stored column, to
// avoid a second source of truth that can go stale relative to the Activity
// timeline. Callers pass the record's activities (any order); this picks the
// most recent by `date`. `Lead.lastActivityAt` is a legacy denormalized field
// and is intentionally NOT read here — the Activity timeline is canonical.

export type ActivityRef = {
  type: string;
  subject: string;
  date: Date | string;
};

export type LastInteraction = {
  label: string;
  type: string;
  date: Date | string;
} | null;

export function deriveLastInteraction(activities: ActivityRef[]): LastInteraction {
  const latest = [...activities].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )[0];
  if (!latest) return null;
  return { label: latest.subject, type: latest.type, date: latest.date };
}
